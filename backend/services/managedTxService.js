/**
 * Performs one on-chain action with an already-authorised signer. All
 * authorisation (who may do what on which project) happens in the controller;
 * the contract enforces roles again on-chain.
 */
import * as core from '../../shared/chainCore.js';

export const MANAGED_ACTIONS = [
  'faucet', 'deploy', 'fund', 'submit', 'approve', 'claimTimeout', 'cancel', 'raiseDispute', 'appeal', 'finalize'
];

/**
 * p: { tokenAddress, escrowAddress, index, proof, evidence, deploy: {...} }
 * returns { txHash, address? }
 */
export const performManagedAction = async (signer, action, p) => {
  switch (action) {
    case 'faucet':       return core.claimFaucet(signer, p.tokenAddress);
    case 'deploy':       return core.deployEscrow(signer, p.deploy);
    case 'fund':         return core.fundMilestone(signer, p.escrowAddress, p.tokenAddress, p.index);
    case 'submit':       return core.submitMilestone(signer, p.escrowAddress, p.index, p.proof || 'deliverables');
    case 'approve':      return core.approveMilestone(signer, p.escrowAddress, p.index);
    case 'claimTimeout': return core.claimAfterTimeout(signer, p.escrowAddress, p.index);
    case 'cancel':       return core.cancelMilestone(signer, p.escrowAddress, p.index);
    case 'raiseDispute': return core.raiseDispute(signer, p.escrowAddress, p.index, p.evidence || 'dispute');
    case 'appeal':       return core.appealRuling(signer, p.escrowAddress, p.index);
    case 'finalize':     return core.finalizeRuling(signer, p.escrowAddress, p.index);
    default: throw new Error(`Unknown action '${action}'.`);
  }
};
