/**
 * EscrowX chain core - used by the React app (MetaMask signer), the backend
 * (read-only provider + arbitrator wallet) and the Node e2e script.
 *
 * Everything here takes a signer/provider as an argument, so it has no
 * browser or server specific dependencies.
 */
import { Contract, ContractFactory, parseUnits, formatUnits, isAddress, getAddress } from 'ethers';
import artifacts from './artifacts.json' with { type: 'json' };

export const INR_DECIMALS = 2; // MockINR uses paise

// Milestone status codes (must match contracts/EscrowX.vy)
export const CHAIN_STATUS = {
  PENDING: 0, FUNDED: 1, SUBMITTED: 2, DISPUTED: 3, RELEASED: 4, REFUNDED: 5, CANCELLED: 6
};
export const CHAIN_STATUS_NAME = Object.fromEntries(Object.entries(CHAIN_STATUS).map(([k, v]) => [v, k]));

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Rupees (number or string) -> on-chain units (BigInt paise). */
export const inrToUnits = (rupees) => parseUnits(Number(rupees).toFixed(INR_DECIMALS), INR_DECIMALS);
/** On-chain units -> rupees as a Number. */
export const unitsToInr = (units) => Number(formatUnits(units, INR_DECIMALS));

export const sameAddress = (a, b) =>
  Boolean(a) && Boolean(b) && isAddress(a) && isAddress(b) && getAddress(a) === getAddress(b);

const escrowAt = (runner, address) => new Contract(address, artifacts.EscrowX.abi, runner);
const tokenAt = (runner, address) => new Contract(address, artifacts.MockINR.abi, runner);

/** Turn an ethers/MetaMask error into a short, human message. */
export const friendlyChainError = (err) => {
  if (err?.code === 'ACTION_REJECTED' || err?.code === 4001) return 'Transaction rejected in your wallet.';
  const reason = err?.reason || err?.revert?.args?.[0] || err?.info?.error?.message || err?.shortMessage || err?.message;
  return String(reason || 'Blockchain transaction failed.').slice(0, 220);
};

/** Make sure the connected wallet is the account this app user registered. */
export const assertSigner = async (signer, expectedAddress) => {
  const actual = await signer.getAddress();
  if (expectedAddress && !sameAddress(actual, expectedAddress)) {
    throw new Error(`Switch your wallet to ${expectedAddress} (currently ${actual}).`);
  }
  return actual;
};

const send = async (txPromise) => {
  const tx = await txPromise;
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error('Transaction reverted on-chain.');
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
};

// ---------------------------------------------------------------- token ---

export const getInrBalance = async (provider, tokenAddress, owner) =>
  unitsToInr(await tokenAt(provider, tokenAddress).balanceOf(owner));

export const getTokenOwner = (provider, tokenAddress) => tokenAt(provider, tokenAddress).owner();
/** Token owner only: mint `rupees` INR to an address. */
export const mintInr = (signer, tokenAddress, to, rupees) => send(tokenAt(signer, tokenAddress).mint(to, inrToUnits(rupees)));

/** true / false, or null when the token has no faucet switch (an older deployment). */
export const isFaucetEnabled = async (provider, tokenAddress) => {
  try { return Boolean(await tokenAt(provider, tokenAddress).faucet_enabled()); } catch { return null; }
};
export const setFaucetEnabled = (signer, tokenAddress, enabled) => send(tokenAt(signer, tokenAddress).set_faucet_enabled(enabled));

/** Plain ERC-20 transfer of `rupees` INR. */
export const transferInr = (signer, tokenAddress, to, rupees) => send(tokenAt(signer, tokenAddress).transfer(to, inrToUnits(rupees)));

/** True if `txHash` is a successful INR token Transfer of exactly `rupees` from `from` to `to`. */
export const verifyInrTransfer = async (provider, tokenAddress, txHash, from, to, rupees) => {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash || '')) return false;
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1) return false;
  const iface = tokenAt(provider, tokenAddress).interface;
  const wanted = inrToUnits(rupees);
  return receipt.logs.some((log) => {
    if (!sameAddress(log.address, tokenAddress)) return false;
    try {
      const parsed = iface.parseLog(log);
      return parsed?.name === 'Transfer'
        && sameAddress(parsed.args[0], from) && sameAddress(parsed.args[1], to) && parsed.args[2] === wanted;
    } catch { return false; }
  });
};

export const claimFaucet = (signer, tokenAddress) => send(tokenAt(signer, tokenAddress).faucet());

// --------------------------------------------------------------- deploy ---

/**
 * Deploy a new EscrowX job contract. The signer becomes the client.
 * milestones: [{ amount: <rupees>, dueDate?: <unix seconds> }]
 */
export const deployEscrow = async (signer, p) => {
  if (!isAddress(p.freelancer)) throw new Error('Freelancer wallet address is missing or invalid.');
  if (!isAddress(p.arbitrator)) throw new Error('Arbitrator address is not configured on the server.');
  const factory = new ContractFactory(artifacts.EscrowX.abi, artifacts.EscrowX.bytecode, signer);
  const client = await signer.getAddress();
  const contract = await factory.deploy(
    client,
    p.freelancer,
    p.arbitrator,
    p.token,
    BigInt(p.reviewPeriod),
    BigInt(p.appealWindow),
    p.specUri || '',
    p.milestones.map((m) => inrToUnits(m.amount)),
    p.milestones.map((m) => BigInt(m.dueDate || 0))
  );
  const receipt = await contract.deploymentTransaction().wait();
  if (!receipt || receipt.status !== 1) throw new Error('Escrow deployment reverted.');
  return { address: await contract.getAddress(), txHash: receipt.hash };
};

// ------------------------------------------------------ milestone actions ---

/** Client: approve token spend (only if needed) and lock funds in escrow. */
export const fundMilestone = async (signer, escrowAddress, tokenAddress, index) => {
  const escrow = escrowAt(signer, escrowAddress);
  const token = tokenAt(signer, tokenAddress);
  const owner = await signer.getAddress();
  const m = await escrow.get_milestone(index);
  const amount = m[0];

  if ((await token.balanceOf(owner)) < amount) {
    throw new Error(`Not enough INR in your wallet. You need ₹${unitsToInr(amount)} - use "Get test INR" first.`);
  }
  if ((await token.allowance(owner, escrowAddress)) < amount) {
    await send(token.approve(escrowAddress, amount));
  }
  return send(escrow.fund_milestone(index));
};

export const submitMilestone = (signer, escrowAddress, index, proofUri) =>
  send(escrowAt(signer, escrowAddress).submit_milestone(index, proofUri));
export const approveMilestone = (signer, escrowAddress, index) =>
  send(escrowAt(signer, escrowAddress).approve_milestone(index));
export const claimAfterTimeout = (signer, escrowAddress, index) =>
  send(escrowAt(signer, escrowAddress).claim_after_timeout(index));
export const cancelMilestone = (signer, escrowAddress, index) =>
  send(escrowAt(signer, escrowAddress).cancel_milestone(index));

// ---------------------------------------------------------------- disputes ---

export const raiseDispute = (signer, escrowAddress, index, evidenceUri) =>
  send(escrowAt(signer, escrowAddress).raise_dispute(index, evidenceUri));
export const appealRuling = (signer, escrowAddress, index) =>
  send(escrowAt(signer, escrowAddress).appeal_ruling(index));
export const finalizeRuling = (signer, escrowAddress, index) =>
  send(escrowAt(signer, escrowAddress).finalize_ruling(index));

/** Arbitrator (server) only. */
export const submitRuling = (signer, escrowAddress, index, winner, confidence, uri) =>
  send(escrowAt(signer, escrowAddress).submit_ruling(index, winner, confidence, uri));
export const submitSecondaryRuling = (signer, escrowAddress, index, winner, uri) =>
  send(escrowAt(signer, escrowAddress).submit_secondary_ruling(index, winner, uri));

// ------------------------------------------------------------------- reads ---

export const readMilestone = async (provider, escrowAddress, index) => {
  const m = await escrowAt(provider, escrowAddress).get_milestone(index);
  return {
    amount: unitsToInr(m[0]),
    amountUnits: m[0],
    status: Number(m[1]),
    statusName: CHAIN_STATUS_NAME[Number(m[1])],
    dueDate: Number(m[2]),
    proofUri: m[3],
    reviewDeadline: Number(m[4]),
    disputeRaisedBy: m[5],
    rulingWinner: m[6],
    rulingConfidence: Number(m[7]),
    appealDeadline: Number(m[9]),
    secondaryRulingWinner: m[10]
  };
};

export const readRuling = async (provider, escrowAddress, index) => {
  const r = await escrowAt(provider, escrowAddress).get_ruling(index);
  return {
    winner: r[0],
    confidence: Number(r[1]),
    appealDeadline: Number(r[2]),
    appealed: Boolean(r[3]),
    secondaryWinner: r[4]
  };
};

/** Read the immutable job parameters (used to verify a registered escrow). */
export const readEscrowInfo = async (provider, escrowAddress) => {
  const c = escrowAt(provider, escrowAddress);
  const [client, freelancer, arbitrator, token, count, review, appeal] = await Promise.all([
    c.client(), c.freelancer(), c.arbitrator(), c.token(), c.milestone_count(), c.review_period(), c.appeal_window()
  ]);
  const amounts = [];
  for (let i = 0; i < Number(count); i++) amounts.push(unitsToInr((await c.get_milestone(i))[0]));
  return { client, freelancer, arbitrator, token, count: Number(count), reviewPeriod: Number(review), appealWindow: Number(appeal), amounts };
};

/** Confirm a tx hash is a successful transaction sent to `escrowAddress`. */
export const verifyTxTo = async (provider, txHash, to) => {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash || '')) return false;
  const receipt = await provider.getTransactionReceipt(txHash);
  return Boolean(receipt) && receipt.status === 1 && (!to || sameAddress(receipt.to, to));
};
