import Payment from '../models/Payment.js';
import { requireUser } from '../middleware/authHelper.js';
import { isChainEnabled, mintInr, dripGasIfNeeded, assertMinterIsOwner, friendlyChainError } from '../services/chainService.js';
import {
  isPaymentsEnabled, getPublicPaymentConfig, createOrder, fetchOrder, verifySignature
} from '../services/paymentService.js';

const fail = (res, code, message) => res.status(code).json({ success: false, message });
const MIN_TOPUP = 1;

export const getPaymentConfig = (req, res) => {
  res.json({ success: true, config: { ...getPublicPaymentConfig(), enabled: isPaymentsEnabled() && isChainEnabled() } });
};

/** Step 1: create a gateway order for the amount the user wants to add. */
export const createPaymentOrder = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!isPaymentsEnabled() || !isChainEnabled()) {
      return fail(res, 503, 'Payments are not configured on the server.');
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(user.walletAddress || '')) {
      return fail(res, 400, 'Connect your wallet first - the tokens are sent to it.');
    }

    const amount = Math.round(Number(req.body.amount) * 100) / 100;
    const { maxTopUp } = getPublicPaymentConfig();
    if (!Number.isFinite(amount) || amount < MIN_TOPUP || amount > maxTopUp) {
      return fail(res, 400, `Amount must be between ₹${MIN_TOPUP} and ₹${maxTopUp}.`);
    }

    // Fail early (before taking money) if we could not mint afterwards.
    try {
      await assertMinterIsOwner();
    } catch (err) {
      return fail(res, 503, err.message);
    }

    const order = await createOrder(amount, `escrowx_${String(user._id).slice(-8)}_${Date.now()}`);
    await Payment.create({ user: user._id, wallet: user.walletAddress, orderId: order.id, amount });
    res.status(201).json({ success: true, orderId: order.id, amount, amountPaise: order.amount, currency: order.currency });
  } catch (error) {
    res.status(502).json({ success: false, message: error.message });
  }
};

/**
 * Credit the tokens for a payment that the gateway has confirmed. Safe to call
 * repeatedly: the status transitions are atomic, so tokens are minted once.
 */
const creditTokens = async (payment) => {
  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: 'PAID' },
    { $set: { status: 'MINTING', lastError: '' } },
    { returnDocument: 'after' }
  );
  if (!claimed) return Payment.findById(payment._id); // already minting/minted elsewhere

  try {
    const mint = await mintInr(claimed.wallet, claimed.amount);
    let gasTxHash = '';
    try {
      const drip = await dripGasIfNeeded(claimed.wallet);
      if (drip.sent) gasTxHash = drip.txHash;
    } catch (e) {
      // gas top-up is best effort; the user can still get ETH from a faucet
    }
    return Payment.findByIdAndUpdate(
      claimed._id,
      { $set: { status: 'MINTED', mintTxHash: mint.txHash, gasTxHash } },
      { returnDocument: 'after' }
    );
  } catch (err) {
    // Money was received but minting failed: return to PAID so it can be retried.
    return Payment.findByIdAndUpdate(
      claimed._id,
      { $set: { status: 'PAID', lastError: friendlyChainError(err) } },
      { returnDocument: 'after' }
    );
  }
};

const describe = (p) => ({
  orderId: p.orderId,
  paymentId: p.paymentId,
  amount: p.amount,
  status: p.status,
  mintTxHash: p.mintTxHash,
  gasTxHash: p.gasTxHash,
  lastError: p.lastError
});

/** Step 2: the browser reports a finished payment; verify the signature, then credit tokens. */
export const verifyPayment = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
    if (!verifySignature(orderId, paymentId, signature)) {
      return fail(res, 400, 'Payment signature verification failed.');
    }

    const payment = await Payment.findOne({ orderId, user: user._id });
    if (!payment) return fail(res, 404, 'Unknown payment order.');

    if (payment.status === 'CREATED') {
      await Payment.updateOne({ _id: payment._id, status: 'CREATED' }, { $set: { status: 'PAID', paymentId } });
    }
    const result = await creditTokens(payment);

    if (result.status === 'MINTED') {
      return res.json({
        success: true,
        message: `₹${result.amount} added to your wallet as INR tokens.`,
        payment: describe(result)
      });
    }
    // Payment is safe (verified + recorded); minting will be retried via reconcile.
    res.status(202).json({
      success: true,
      message: 'Payment received. Crediting your INR tokens is taking longer than usual - it will be retried automatically.',
      payment: describe(result)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** The caller's top-ups. Also retries crediting anything that was paid but not yet minted. */
export const listMyPayments = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    let payments = await Payment.find({ user: user._id }).sort({ createdAt: -1 }).limit(20);

    // Only recent unpaid orders are re-checked with the gateway (avoid hammering it).
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    let gatewayChecks = 0;
    for (const p of payments) {
      if (p.status === 'PAID') {
        await creditTokens(p);
      } else if (p.status === 'CREATED' && isPaymentsEnabled() && p.createdAt.getTime() > dayAgo && gatewayChecks < 3) {
        gatewayChecks += 1;
        // The browser may have closed after paying: ask the gateway.
        try {
          const order = await fetchOrder(p.orderId);
          if (order.status === 'paid' && order.amount_paid === Math.round(p.amount * 100)) {
            await Payment.updateOne({ _id: p._id, status: 'CREATED' }, { $set: { status: 'PAID' } });
            await creditTokens(p);
          }
        } catch (e) {
          // gateway unreachable: leave as is
        }
      }
    }
    payments = await Payment.find({ user: user._id }).sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, payments: payments.map(describe) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
