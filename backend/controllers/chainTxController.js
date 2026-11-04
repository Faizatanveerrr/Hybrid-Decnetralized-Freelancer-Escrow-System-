import mongoose from 'mongoose';
import Project from '../models/Project.js';
import Milestone from '../models/Milestone.js';
import User from '../models/User.js';
import { requireUser, projectRole } from '../middleware/authHelper.js';
import { isChainEnabled, getChainConfig, dripGasIfNeeded, runSerial, sameAddress, friendlyChainError } from '../services/chainService.js';
import { getManagedSigner, ensureManagedWallet } from '../services/walletService.js';
import { MANAGED_ACTIONS, performManagedAction } from '../services/managedTxService.js';

const fail = (res, code, message) => res.status(code).json({ success: false, message });

// Who may trigger which action (the contract enforces this again on-chain).
const REQUIRED_ROLE = {
  deploy: 'client', fund: 'client', approve: 'client', cancel: 'client',
  submit: 'freelancer', claimTimeout: 'freelancer'
};

/**
 * Sign and send an on-chain action for a user who has a platform-managed
 * wallet. Parameters (amounts, parties, contract address) always come from our
 * database, never from the request body.
 */
export const executeManagedTx = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!isChainEnabled()) return fail(res, 503, 'Blockchain is not configured on the server.');

    const { action, projectId, milestoneId, proof, evidence } = req.body;
    if (!MANAGED_ACTIONS.includes(action)) return fail(res, 400, 'Unknown action.');

    if (user.walletType !== 'managed' || !sameAddress(user.walletAddress, user.managedWallet?.address)) {
      return fail(res, 403, 'Your account uses your own wallet - sign this transaction in MetaMask.');
    }

    const config = getChainConfig();
    const params = { tokenAddress: config.tokenAddress };

    if (action !== 'faucet') {
      if (!mongoose.isValidObjectId(projectId)) return fail(res, 400, 'A valid projectId is required.');
      const project = await Project.findById(projectId).populate('milestones');
      if (!project) return fail(res, 404, 'Project not found.');

      const role = projectRole(project, user);
      if (!role) return fail(res, 403, 'You are not a participant of this project.');
      if (REQUIRED_ROLE[action] && REQUIRED_ROLE[action] !== role) {
        return fail(res, 403, `Only the project ${REQUIRED_ROLE[action]} can do this.`);
      }

      if (action === 'deploy') {
        if (project.escrowAddress) return fail(res, 409, 'This project already has an escrow contract.');
        if (!project.freelancer) return fail(res, 400, 'Assign a freelancer first.');
        if (project.milestones.some((m) => m.status !== 'PENDING')) {
          return fail(res, 409, 'Milestones were already processed off-chain; deploy before funding.');
        }
        const freelancer = await User.findById(project.freelancer);
        if (!freelancer.walletAddress) await ensureManagedWallet(freelancer); // give them a wallet to be paid into
        if (!freelancer.walletAddress) return fail(res, 400, 'The freelancer has no wallet yet.');
        params.deploy = {
          freelancer: freelancer.walletAddress,
          arbitrator: config.arbitratorAddress,
          token: config.tokenAddress,
          reviewPeriod: config.reviewPeriod,
          appealWindow: config.appealWindow,
          specUri: `escrowx://project/${project._id}`,
          milestones: project.milestones.map((m) => ({ amount: m.amount }))
        };
      } else {
        if (!project.escrowAddress) return fail(res, 400, 'Deploy the escrow contract first.');
        params.escrowAddress = project.escrowAddress;
        if (!mongoose.isValidObjectId(milestoneId)) return fail(res, 400, 'A valid milestoneId is required.');
        const milestone = project.milestones.find((m) => String(m._id) === String(milestoneId));
        if (!milestone || milestone.chainIndex < 0) return fail(res, 404, 'Milestone is not part of the escrow.');
        params.index = milestone.chainIndex;
        params.proof = typeof proof === 'string' ? proof.slice(0, 500) : '';
        params.evidence = typeof evidence === 'string' ? evidence.slice(0, 500) : '';
      }
    }

    const signer = await getManagedSigner(user._id);
    // Testnet convenience: make sure the wallet can pay gas.
    await dripGasIfNeeded(signer.address).catch(() => {});

    const result = await runSerial(signer, () => performManagedAction(signer, action, params));
    res.json({ success: true, txHash: result.txHash, address: result.address });
  } catch (error) {
    // Contract reverts carry a readable reason ("Review period expired", ...).
    res.status(400).json({ success: false, message: friendlyChainError(error) });
  }
};
