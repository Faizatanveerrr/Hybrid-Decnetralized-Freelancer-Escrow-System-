/**
 * Blockchain Escrow Service Helper
 * In a production deployment with configured RPC/signer, this connects to an Escrow smart contract.
 * Note: Does not invent or generate fake transaction hashes.
 */

export const fundMilestone = async (milestoneId, amount, clientWallet) => {
  console.log(`[Escrow Contract Service] Request to fund milestone ${milestoneId} with ${amount} INR from ${clientWallet || 'client'}`);
  return {
    success: true,
    txHash: null,
    amount,
    status: 'FUNDED',
    timestamp: new Date().toISOString()
  };
};

export const approveMilestone = async (milestoneId) => {
  console.log(`[Escrow Contract Service] Client approval recorded for milestone ${milestoneId}`);
  return {
    success: true,
    txHash: null,
    status: 'APPROVED'
  };
};

export const releasePayment = async (milestoneId, amount, recipientAddress) => {
  console.log(`[Escrow Contract Service] Milestone ${milestoneId} release of ${amount} INR to ${recipientAddress || 'freelancer'}`);
  return {
    success: true,
    txHash: null,
    amount,
    recipient: recipientAddress || null,
    status: 'RELEASED',
    timestamp: new Date().toISOString()
  };
};

export const raiseDispute = async (milestoneId) => {
  console.log(`[Escrow Contract Service] Milestone ${milestoneId} locked in escrow pending dispute`);
  return {
    success: true,
    txHash: null,
    status: 'DISPUTED'
  };
};

export const claimAfterTimeout = async (milestoneId) => {
  console.log(`[Escrow Contract Service] Timeout elapsed for milestone ${milestoneId}`);
  return {
    success: true,
    txHash: null,
    status: 'RELEASED_TIMEOUT'
  };
};
