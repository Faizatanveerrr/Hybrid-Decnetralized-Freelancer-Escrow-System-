import crypto from 'crypto';
import Payout from '../models/Payout.js';
import { requireUser } from '../middleware/authHelper.js';
import {
  isChainEnabled, getChainConfig, getInrBalanceOf, getTreasuryAddress, transferFromTreasury,
  isFaucetOpen, verifyTokenTransfer, dripGasIfNeeded, runSerial, friendlyChainError
} from '../services/chainService.js';
import { getManagedSigner } from '../services/walletService.js';
import * as core from '../../shared/chainCore.js';
import {
  getPayoutMode, isLivePayouts, getPayoutLimits, isValidVpa, sendPayout, fetchPayoutStatus
} from '../services/payoutService.js';

const fail = (res, code, message) => res.status(code).json({ success: false, message });
const STALE_MS = 60 * 1000; // a payout stuck this long between steps is retried by reconcile

export const getPayoutConfig = (req, res) => {
  const enabled = isChainEnabled();
  res.json({
    success: true,
    config: {
      enabled,
      mode: getPayoutMode(),
      live: isLivePayouts(),
      ...getPayoutLimits(),
      treasuryAddress: enabled ? getTreasuryAddress() : ''
    }
  });
};

const describe = (p) => ({
  id: p._id, amount: p.amount, vpa: p.vpa, status: p.status, mode: p.mode, utr: p.utr,
  collectTxHash: p.collectTxHash || '', refundTxHash: p.refundTxHash, lastError: p.lastError, createdAt: p.createdAt
});

/** Atomic status change: only succeeds if the payout is still in one of `from`. */
const moveTo = (id, from, set) =>
  Payout.findOneAndUpdate({ _id: id, status: { $in: from } }, { $set: set }, { returnDocument: 'after' });

/** Give the tokens back (payout failed). Safe to call repeatedly. */
const refundTokens = async (payout) => {
  const claimed = await moveTo(payout._id, ['FAILED'], { status: 'REFUNDING' });
  if (!claimed) return Payout.findById(payout._id);
  try {
    const tx = await transferFromTreasury(claimed.wallet, claimed.amount);
    return await Payout.findByIdAndUpdate(claimed._id, { $set: { status: 'REFUNDED', refundTxHash: tx.txHash } }, { returnDocument: 'after' });
  } catch (err) {
    return await Payout.findByIdAndUpdate(claimed._id, { $set: { status: 'FAILED', lastError: `Refund pending: ${friendlyChainError(err)}` } }, { returnDocument: 'after' });
  }
};

/** Ask the gateway to pay out, then record the outcome. */
const dispatchPayout = async (payout, user) => {
  let result;
  try {
    result = await sendPayout({ idempotencyKey: payout.idempotencyKey, amount: payout.amount, vpa: payout.vpa, user });
  } catch (err) {
    // The gateway refused it: no rupees left, so return the tokens.
    await moveTo(payout._id, ['COLLECTED'], { status: 'FAILED', lastError: err.message });
    return refundTokens(payout);
  }
  const next = result.status === 'FAILED' ? 'FAILED' : result.status;
  const updated = await moveTo(payout._id, ['COLLECTED', 'PROCESSING'], {
    status: next, gatewayPayoutId: result.id, utr: result.utr, lastError: result.failureReason
  });
  return next === 'FAILED' ? refundTokens(payout) : (updated || Payout.findById(payout._id));
};

/**
 * Everything that can be checked before any tokens move. Returns
 * { amount, vpa } or { error: { code, message } }.
 */
const checkRequest = async (user, body, { checkBalance }) => {
  const bad = (code, message) => ({ error: { code, message } });
  if (!isChainEnabled()) return bad(503, 'Blockchain is not configured on the server.');
  if (!/^0x[0-9a-fA-F]{40}$/.test(user.walletAddress || '')) return bad(400, 'You need a wallet first.');

  const { min, max } = getPayoutLimits();
  const amount = Math.round(Number(body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < min || amount > max) return bad(400, `Amount must be between ₹${min} and ₹${max}.`);
  const vpa = String(body.vpa || user.upiId || '').trim();
  if (!isValidVpa(vpa)) return bad(400, 'Enter a valid UPI ID, like name@okhdfcbank.');

  // SAFETY: real rupees must never be payable against tokens anyone can mint for free.
  if (isLivePayouts()) {
    const faucet = await isFaucetOpen().catch(() => null);
    if (faucet !== false) {
      return bad(503, 'Live payouts are disabled while the INR token has a public faucet. Run `npm run token:lock-faucet` first.');
    }
  }
  if (checkBalance) {
    const balance = await getInrBalanceOf(user.walletAddress);
    if (balance < amount) return bad(400, `Not enough INR in your wallet (you have ₹${balance}).`);
  }
  return { amount, vpa };
};

/** Dry run: lets the app validate a withdrawal BEFORE a MetaMask user sends any tokens. */
export const validatePayout = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const checked = await checkRequest(user, req.body, { checkBalance: true });
    if (checked.error) return fail(res, checked.error.code, checked.error.message);
    res.json({ success: true, ...checked, treasuryAddress: getTreasuryAddress() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Withdraw INR tokens to the user's UPI ID. */
export const createPayout = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    // Managed wallets: the server takes the tokens, so check the balance first.
    // (MetaMask users have already sent them; that transfer is verified below.)
    const checked = await checkRequest(user, req.body, { checkBalance: user.walletType === 'managed' });
    if (checked.error) return fail(res, checked.error.code, checked.error.message);
    const { amount, vpa } = checked;

    const treasury = getTreasuryAddress();
    const collectHash = user.walletType === 'managed' ? undefined : String(req.body.txHash || '');
    if (user.walletType !== 'managed') {
      if (!(await verifyTokenTransfer(collectHash, user.walletAddress, treasury, amount))) {
        return fail(res, 400, 'Send the INR tokens to the platform treasury from your wallet first (no matching transfer found).');
      }
    }

    let payout;
    try {
      payout = await Payout.create({
        user: user._id, wallet: user.walletAddress, amount, vpa, mode: getPayoutMode(),
        idempotencyKey: crypto.randomUUID(), ...(collectHash ? { collectTxHash: collectHash } : {})
      });
    } catch (err) {
      if (err.code === 11000) return fail(res, 409, 'That token transfer was already used for a payout.');
      throw err;
    }

    // 1. Collect the tokens
    if (user.walletType === 'managed') {
      try {
        const signer = await getManagedSigner(user._id);
        await dripGasIfNeeded(signer.address).catch(() => {});
        const tx = await runSerial(signer, () => core.transferInr(signer, getChainConfig().tokenAddress, treasury, amount));
        payout = await Payout.findByIdAndUpdate(payout._id, { $set: { collectTxHash: tx.txHash } }, { returnDocument: 'after' });
      } catch (err) {
        await moveTo(payout._id, ['REQUESTED'], { status: 'CANCELLED', lastError: friendlyChainError(err) });
        return fail(res, 400, `Could not take the tokens from your wallet: ${friendlyChainError(err)}`);
      }
    }
    payout = await moveTo(payout._id, ['REQUESTED'], { status: 'COLLECTED' });

    // 2. Pay out the rupees
    if (vpa !== user.upiId) { user.upiId = vpa; await user.save(); }
    const done = await dispatchPayout(payout, user);

    const note = done.mode === 'simulated' ? ' (simulated - no real money moved)' : '';
    const message = {
      PROCESSED: `₹${done.amount} sent to ${done.vpa}${note}.`,
      PROCESSING: `Payout of ₹${done.amount} to ${done.vpa} is being processed.`,
      REFUNDED: `The payout failed, so your ₹${done.amount} was returned to your wallet. ${done.lastError || ''}`.trim(),
      FAILED: `The payout failed; your tokens will be returned shortly. ${done.lastError || ''}`.trim()
    }[done.status] || `Payout status: ${done.status}.`;
    res.status(done.status === 'REFUNDED' || done.status === 'FAILED' ? 502 : 201).json({ success: done.status !== 'REFUNDED' && done.status !== 'FAILED', message, payout: describe(done) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** The caller's withdrawals; also finishes anything left half-done. */
export const listMyPayouts = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const payouts = await Payout.find({ user: user._id }).sort({ createdAt: -1 }).limit(20);

    for (const p of payouts) {
      const age = Date.now() - p.createdAt.getTime();
      try {
        if (p.status === 'FAILED') {
          await refundTokens(p);
        } else if (p.status === 'COLLECTED' && age > STALE_MS) {
          await dispatchPayout(p, user); // same idempotency key: cannot double pay
        } else if (p.status === 'PROCESSING' && p.gatewayPayoutId) {
          const s = await fetchPayoutStatus(p.gatewayPayoutId);
          if (s.status === 'PROCESSED') await moveTo(p._id, ['PROCESSING'], { status: 'PROCESSED', utr: s.utr });
          if (s.status === 'FAILED') {
            await moveTo(p._id, ['PROCESSING'], { status: 'FAILED', lastError: s.failureReason });
            await refundTokens(p);
          }
        }
      } catch (e) {
        // gateway/chain unreachable: try again next time
      }
    }
    const fresh = await Payout.find({ user: user._id }).sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, payouts: fresh.map(describe) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
