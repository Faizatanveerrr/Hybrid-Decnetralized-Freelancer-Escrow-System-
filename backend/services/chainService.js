/**
 * Server-side blockchain access.
 *
 *  - read-only: the backend never trusts the browser; before it updates the
 *    database it reads the contract to confirm the on-chain state changed.
 *  - arbitrator: signs AI rulings (submit_ruling / submit_secondary_ruling).
 *
 * Env is read lazily (dotenv is loaded after imports in server.js).
 */
import { JsonRpcProvider, Wallet, parseEther } from 'ethers';
import * as core from '../../shared/chainCore.js';

const DEFAULT_REVIEW_PERIOD = 15 * 60;  // seconds - short on purpose for demos
const DEFAULT_APPEAL_WINDOW = 5 * 60;   // set REVIEW_PERIOD_SECONDS / APPEAL_WINDOW_SECONDS for real use

let cache = { key: '', provider: null, arbitrator: null, minter: null };

const settings = () => ({
  rpcUrl: process.env.SEPOLIA_RPC_URL || process.env.RPC_URL || '',
  chainId: Number(process.env.CHAIN_ID || 11155111),
  tokenAddress: process.env.TOKEN_ADDRESS || '',
  arbitratorKey: process.env.ARBITRATOR_PRIVATE_KEY || '',
  // Wallet that owns the INR token (mints after a verified fiat payment). Defaults to the arbitrator.
  minterKey: process.env.MINTER_PRIVATE_KEY || process.env.ARBITRATOR_PRIVATE_KEY || '',
  gasDripEth: process.env.GAS_DRIP_ETH || '0.03',
  explorerUrl: process.env.EXPLORER_URL || 'https://sepolia.etherscan.io',
  reviewPeriod: Number(process.env.REVIEW_PERIOD_SECONDS || DEFAULT_REVIEW_PERIOD),
  appealWindow: Number(process.env.APPEAL_WINDOW_SECONDS || DEFAULT_APPEAL_WINDOW)
});

const init = () => {
  const s = settings();
  const key = [s.rpcUrl, s.arbitratorKey, s.minterKey].join('|');
  if (cache.key !== key) {
    const provider = new JsonRpcProvider(s.rpcUrl, s.chainId, { staticNetwork: true, cacheTimeout: -1 });
    const arbitrator = s.arbitratorKey ? new Wallet(s.arbitratorKey, provider) : null;
    const minter = s.minterKey === s.arbitratorKey ? arbitrator : (s.minterKey ? new Wallet(s.minterKey, provider) : null);
    cache = { key, provider, arbitrator, minter };
  }
  return cache;
};

export const isChainEnabled = () => {
  const s = settings();
  return Boolean(s.rpcUrl && s.tokenAddress && s.arbitratorKey);
};

/** Public configuration the frontend needs (never includes the private key). */
export const getChainConfig = () => {
  const s = settings();
  const enabled = isChainEnabled();
  return {
    enabled,
    chainId: s.chainId,
    tokenAddress: s.tokenAddress,
    arbitratorAddress: enabled ? init().arbitrator.address : '',
    reviewPeriod: s.reviewPeriod,
    appealWindow: s.appealWindow,
    explorerUrl: s.explorerUrl,
    currency: { symbol: '₹', code: 'INR', decimals: core.INR_DECIMALS }
  };
};

const ensure = () => {
  if (!isChainEnabled()) {
    throw new Error('Blockchain is not configured on the server (SEPOLIA_RPC_URL, TOKEN_ADDRESS, ARBITRATOR_PRIVATE_KEY).');
  }
  return init();
};

export const getProvider = () => ensure().provider;
export const getInrBalanceOf = (address) => core.getInrBalance(ensure().provider, settings().tokenAddress, address);

/** Run `fn` after all earlier transactions from the same wallet have finished. */
export const runSerial = (wallet, fn) => serialize(wallet, fn);

export const readMilestone = (escrow, index) => core.readMilestone(ensure().provider, escrow, index);
export const readRuling = (escrow, index) => core.readRuling(ensure().provider, escrow, index);
export const verifyTx = (txHash, escrow) => core.verifyTxTo(ensure().provider, txHash, escrow);

/**
 * Check that a client-supplied escrow contract really is the job the DB
 * describes: right parties, right token, our arbitrator, same milestones.
 * Returns the on-chain info, or throws an Error with a user-facing message.
 */
export const verifyEscrowMatches = async (escrowAddress, { clientWallet, freelancerWallet, amounts }) => {
  const { provider, arbitrator } = ensure();
  const code = await provider.getCode(escrowAddress);
  if (!code || code === '0x') throw new Error('No contract found at that address on the configured network.');

  const info = await core.readEscrowInfo(provider, escrowAddress);
  const s = settings();

  if (!core.sameAddress(info.client, clientWallet)) throw new Error('Escrow client does not match the project client wallet.');
  if (!core.sameAddress(info.freelancer, freelancerWallet)) throw new Error('Escrow freelancer does not match the project freelancer wallet.');
  if (!core.sameAddress(info.arbitrator, arbitrator.address)) throw new Error('Escrow arbitrator is not this platform\'s arbitrator.');
  if (!core.sameAddress(info.token, s.tokenAddress)) throw new Error('Escrow is not denominated in the platform INR token.');
  if (info.count !== amounts.length) throw new Error('Escrow milestone count does not match the project.');
  amounts.forEach((a, i) => {
    if (Math.round(a * 100) !== Math.round(info.amounts[i] * 100)) {
      throw new Error(`Escrow milestone ${i + 1} amount (₹${info.amounts[i]}) does not match the project (₹${a}).`);
    }
  });
  return info;
};

// A wallet has a single nonce sequence, so each wallet's transactions run one
// at a time (two at once would otherwise collide).
const queues = new Map();
const serialize = (wallet, fn) => {
  const prev = queues.get(wallet.address) || Promise.resolve();
  const run = prev.then(fn, fn);
  queues.set(wallet.address, run.catch(() => {}));
  return run;
};

/** Arbitrator wallet signs the AI ruling on-chain. */
export const submitRulingOnChain = (escrow, index, winnerAddress, confidence, uri, secondary = false) => {
  const { arbitrator } = ensure();
  return serialize(arbitrator, () =>
    secondary
      ? core.submitSecondaryRuling(arbitrator, escrow, index, winnerAddress, uri)
      : core.submitRuling(arbitrator, escrow, index, winnerAddress, confidence, uri)
  );
};

/**
 * Confirm the minter wallet really owns the INR token, so a payment is never
 * accepted that we could not honour. Throws a clear message otherwise.
 */
export const assertMinterIsOwner = async () => {
  const { provider, minter } = ensure();
  const owner = await core.getTokenOwner(provider, settings().tokenAddress);
  if (!core.sameAddress(owner, minter.address)) {
    throw new Error(`The INR token is owned by ${owner}, not by the minter wallet ${minter.address}. Set MINTER_PRIVATE_KEY to the token owner's key.`);
  }
};

/** Mint INR tokens to a user's wallet after a verified fiat payment. */
export const mintInr = (to, rupees) => {
  const { minter } = ensure();
  return serialize(minter, () => core.mintInr(minter, settings().tokenAddress, to, rupees));
};

/**
 * Testnet convenience: if a user's wallet has (almost) no ETH, send a small
 * amount so they can pay gas for their escrow transactions. Never on mainnet.
 */
export const dripGasIfNeeded = async (to) => {
  const s = settings();
  if (s.chainId === 1) return { sent: false, reason: 'mainnet' };
  const { provider, minter } = ensure();
  const drip = parseEther(s.gasDripEth);
  if (drip <= 0n) return { sent: false, reason: 'disabled' };
  const balance = await provider.getBalance(to);
  if (balance >= drip / 2n) return { sent: false, reason: 'has-gas' };
  return serialize(minter, async () => {
    const tx = await minter.sendTransaction({ to, value: drip });
    const receipt = await tx.wait();
    return { sent: true, txHash: receipt.hash };
  });
};

/** The platform treasury receives tokens users cash out, and returns them if a payout fails. */
export const getTreasuryAddress = () => ensure().minter.address;
export const transferFromTreasury = (to, rupees) => {
  const { minter } = ensure();
  return serialize(minter, () => core.transferInr(minter, settings().tokenAddress, to, rupees));
};
/** true / false, or null for an older token without a faucet switch. */
export const isFaucetOpen = () => core.isFaucetEnabled(ensure().provider, settings().tokenAddress);
export const verifyTokenTransfer = (txHash, from, to, rupees) =>
  core.verifyInrTransfer(ensure().provider, settings().tokenAddress, txHash, from, to, rupees);

export const sameAddress = core.sameAddress;
export const friendlyChainError = core.friendlyChainError;
