import mongoose from 'mongoose';
import Milestone from '../models/Milestone.js';
import Project from '../models/Project.js';
import Transaction from '../models/Transaction.js';
import {
  fundMilestone as blockchainFund,
  approveMilestone as blockchainApprove,
  releasePayment as blockchainRelease
} from '../services/blockchainService.js';
import { requireUser, projectRole } from '../middleware/authHelper.js';
import * as chainSvc from '../services/chainService.js';
import { syncProjectCompletion } from '../services/projectService.js';
import IpfsObject from '../models/IpfsObject.js';
import { isValidCid, uriFor, cidFromUri } from '../services/ipfsService.js';

const REVIEW_PERIOD_HOURS = 72;

const fail = (res, code, message) => res.status(code).json({ success: false, message });

/**
 * Load milestone + project and verify the caller has the required role.
 * Sends the error response itself and returns null on any failure.
 */
const loadForRole = async (req, res, requiredRole) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    fail(res, 404, 'Invalid milestone ID');
    return null;
  }
  const user = await requireUser(req, res);
  if (!user) return null;

  const milestone = await Milestone.findById(req.params.id);
  if (!milestone) {
    fail(res, 404, 'Milestone not found');
    return null;
  }
  const project = await Project.findById(milestone.projectId);
  if (!project) {
    fail(res, 404, 'Associated project not found');
    return null;
  }
  if (projectRole(project, user) !== requiredRole) {
    fail(res, 403, `Only the project ${requiredRole} can perform this action.`);
    return null;
  }
  return { user, milestone, project };
};

/**
 * On-chain projects: the blockchain is the source of truth. The wallet
 * transaction must already have happened; we read the contract, require the
 * expected status, and only then mirror it into the database.
 * Returns the on-chain milestone state, or null after sending an error.
 */
const chainCheck = async (req, res, project, milestone, expectedStatuses) => {
  try {
    if (milestone.chainIndex < 0) {
      fail(res, 409, 'This milestone is not linked to the escrow contract.');
      return null;
    }
    const state = await chainSvc.readMilestone(project.escrowAddress, milestone.chainIndex);
    if (!expectedStatuses.includes(state.statusName)) {
      fail(res, 409, `On-chain status is ${state.statusName}. Complete the wallet transaction first.`);
      return null;
    }
    const txHash = req.body?.txHash || '';
    if (txHash && !(await chainSvc.verifyTx(txHash, project.escrowAddress))) {
      fail(res, 400, 'txHash is not a successful transaction on this escrow contract.');
      return null;
    }
    return { ...state, txHash };
  } catch (err) {
    fail(res, 502, `Could not read the blockchain: ${err.message}`);
    return null;
  }
};

/**
 * Atomic compare-and-set on status so concurrent requests cannot, for
 * example, release the same milestone twice.
 */
const transition = (milestone, fromStatuses, patch) =>
  Milestone.findOneAndUpdate(
    { _id: milestone._id, status: { $in: fromStatuses } },
    { $set: patch },
    { returnDocument: 'after' }
  );

export const getMilestones = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const { projectId, status } = req.query;
    const query = {};
    if (projectId && mongoose.isValidObjectId(projectId)) query.projectId = projectId;
    if (status && status !== 'ALL') query.status = status;

    // Only milestones of projects the caller participates in.
    const mine = await Project.find({ $or: [{ client: user._id }, { freelancer: user._id }] }, '_id');
    const mineIds = mine.map((p) => String(p._id));
    if (query.projectId) {
      if (!mineIds.includes(String(query.projectId))) return res.json({ success: true, milestones: [] });
    } else {
      query.projectId = { $in: mineIds };
    }

    const milestones = await Milestone.find(query).populate('projectId', 'title').sort({ createdAt: -1 });
    res.json({ success: true, milestones });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMilestoneById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return fail(res, 404, 'Invalid milestone ID');
    }
    const user = await requireUser(req, res);
    if (!user) return;
    const milestone = await Milestone.findById(req.params.id);
    if (!milestone) return fail(res, 404, 'Milestone not found');
    // Open projects are browsable by freelancers evaluating them, so reads
    // are restricted only for assigned projects.
    const project = await Project.findById(milestone.projectId);
    if (project?.freelancer && !projectRole(project, user)) {
      return fail(res, 403, 'Not a participant of this project.');
    }
    res.json({ success: true, milestone });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const fundMilestone = async (req, res) => {
  try {
    const ctx = await loadForRole(req, res, 'client');
    if (!ctx) return;
    const { milestone, project } = ctx;

    if (!project.freelancer) {
      return fail(res, 400, 'Assign a freelancer to the project before funding a milestone.');
    }

    const amount = milestone.amount || 0;
    const clientWallet = project.clientWallet || '';

    const chainState = project.escrowAddress ? await chainCheck(req, res, project, milestone, ['FUNDED']) : null;
    if (project.escrowAddress && !chainState) return;

    const updated = await transition(milestone, ['PENDING'], { status: 'FUNDED', fundedAt: new Date() });
    if (!updated) {
      return fail(res, 409, `Milestone cannot be funded from status '${milestone.status}'.`);
    }

    let bcResult;
    try {
      bcResult = chainState ? { txHash: chainState.txHash } : await blockchainFund(milestone._id, amount, clientWallet);
    } catch (err) {
      // Roll back so the milestone is not marked funded without a deposit.
      await Milestone.findByIdAndUpdate(milestone._id, { status: 'PENDING', $unset: { fundedAt: 1 } });
      throw err;
    }

    await Transaction.create({
      projectId: milestone.projectId,
      projectTitle: project.title || 'Project',
      milestoneId: milestone._id,
      milestoneTitle: milestone.title,
      type: 'DEPOSIT',
      amount,
      from: clientWallet || 'Client',
      to: 'Escrow Vault',
      txHash: bcResult.txHash || '',
      status: 'CONFIRMED'
    });

    res.json({
      success: true,
      message: `Milestone funded. ₹${amount} deposited into the escrow contract.`,
      milestone: updated,
      txHash: bcResult.txHash
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const submitWork = async (req, res) => {
  try {
    const ctx = await loadForRole(req, res, 'freelancer');
    if (!ctx) return;
    const { milestone, project } = ctx;

    const { proof, proofCid } = req.body;
    const now = new Date();

    // Optional deliverable file on IPFS: it must be the freelancer's own upload for this project.
    let fileObject = null;
    if (proofCid) {
      fileObject = isValidCid(proofCid) ? await IpfsObject.findOne({ cid: proofCid, kind: 'deliverable' }) : null;
      if (!fileObject || String(fileObject.projectId) !== String(project._id) || String(fileObject.uploadedBy) !== String(ctx.user._id)) {
        return fail(res, 400, 'That file was not uploaded by you for this project.');
      }
    }

    const chainState = project.escrowAddress ? await chainCheck(req, res, project, milestone, ['SUBMITTED']) : null;
    if (project.escrowAddress && !chainState) return;
    // The hash the freelancer signed on-chain must be the file we store: this ties the DB record to the blockchain.
    if (chainState && fileObject && cidFromUri(chainState.proofUri) !== fileObject.cid) {
      return fail(res, 409, 'The file hash recorded on-chain does not match the uploaded file.');
    }

    const updated = await transition(milestone, ['FUNDED'], {
      status: 'SUBMITTED',
      proof: typeof proof === 'string' && proof.trim() ? proof.trim() : (fileObject ? `Deliverable file: ${fileObject.name}` : 'Deliverables submitted for review.'),
      proofCid: fileObject ? fileObject.cid : '',
      proofName: fileObject ? fileObject.name : '',
      submittedAt: now,
      // On-chain projects use the contract's own review deadline.
      autoReleaseDeadline: chainState
        ? new Date(chainState.reviewDeadline * 1000)
        : new Date(now.getTime() + REVIEW_PERIOD_HOURS * 3600000)
    });
    if (!updated) {
      return fail(res, 409, `Work can only be submitted on a funded milestone (current status: '${milestone.status}').`);
    }

    res.json({
      success: true,
      message: chainState
        ? 'Deliverables submitted on-chain. The client review period has started.'
        : `Deliverables submitted. Client has ${REVIEW_PERIOD_HOURS} hours to review.`,
      milestone: updated
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const approveMilestone = async (req, res) => {
  try {
    const ctx = await loadForRole(req, res, 'client');
    if (!ctx) return;
    const { milestone, project } = ctx;

    const amount = milestone.amount || 0;
    const freelancerWallet = project.freelancerWallet || '';

    const chainState = project.escrowAddress ? await chainCheck(req, res, project, milestone, ['RELEASED']) : null;
    if (project.escrowAddress && !chainState) return;

    const updated = await transition(milestone, ['SUBMITTED'], { status: 'RELEASED', releasedAt: new Date() });
    if (!updated) {
      return fail(res, 409, `Only a submitted milestone can be approved (current status: '${milestone.status}').`);
    }

    let releaseRes;
    if (chainState) {
      releaseRes = { txHash: chainState.txHash };
    } else {
      await blockchainApprove(milestone._id);
      releaseRes = await blockchainRelease(milestone._id, amount, freelancerWallet);
    }

    await Transaction.create({
      projectId: milestone.projectId,
      projectTitle: project.title || 'Project',
      milestoneId: milestone._id,
      milestoneTitle: milestone.title,
      type: 'RELEASE',
      amount,
      from: 'Escrow Vault',
      to: freelancerWallet || 'Freelancer',
      txHash: releaseRes.txHash || '',
      status: 'CONFIRMED'
    });
    await syncProjectCompletion(project);

    res.json({
      success: true,
      message: `Milestone approved and ₹${amount} released to the freelancer.`,
      milestone: updated,
      txHash: releaseRes.txHash
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const cancelMilestone = async (req, res) => {
  try {
    const ctx = await loadForRole(req, res, 'client');
    if (!ctx) return;
    const { milestone, project } = ctx;

    const wasFunded = milestone.status === 'FUNDED';

    const chainState = project.escrowAddress ? await chainCheck(req, res, project, milestone, ['CANCELLED']) : null;
    if (project.escrowAddress && !chainState) return;

    const updated = await transition(milestone, ['PENDING', 'FUNDED'], { status: 'CANCELLED' });
    if (!updated) {
      return fail(res, 409, `A milestone in status '${milestone.status}' cannot be cancelled.`);
    }

    // A funded milestone is refunded to the client (matches cancel_milestone on-chain).
    if (wasFunded) {
      await Transaction.create({
        projectId: milestone.projectId,
        projectTitle: project.title || 'Project',
        milestoneId: milestone._id,
        milestoneTitle: milestone.title,
        type: 'REFUND',
        amount: milestone.amount || 0,
        from: 'Escrow Vault',
        to: project.clientWallet || 'Client',
        txHash: chainState?.txHash || '',
        status: 'CONFIRMED'
      });
    }
    await syncProjectCompletion(project);

    res.json({
      success: true,
      message: wasFunded ? 'Milestone cancelled and escrowed funds refunded.' : 'Milestone cancelled.',
      milestone: updated
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const claimAfterTimeout = async (req, res) => {
  try {
    const ctx = await loadForRole(req, res, 'freelancer');
    if (!ctx) return;
    const { milestone, project } = ctx;

    if (milestone.status !== 'SUBMITTED') {
      return fail(res, 400, `Cannot claim timeout on milestone with status '${milestone.status}'. Milestone must be in 'SUBMITTED' status.`);
    }
    if (!milestone.autoReleaseDeadline) {
      return fail(res, 400, 'Milestone does not have an active auto-release deadline.');
    }
    const deadline = new Date(milestone.autoReleaseDeadline);
    if (new Date() < deadline) {
      return fail(res, 400, `Auto-release review window is still active until ${deadline.toISOString()}. Timeout cannot be claimed yet.`);
    }

    const amount = milestone.amount || 0;
    const freelancerWallet = project.freelancerWallet || '';

    const chainState = project.escrowAddress ? await chainCheck(req, res, project, milestone, ['RELEASED']) : null;
    if (project.escrowAddress && !chainState) return;

    const updated = await transition(milestone, ['SUBMITTED'], { status: 'RELEASED', releasedAt: new Date() });
    if (!updated) {
      return fail(res, 409, 'Milestone was already resolved.');
    }

    const releaseRes = chainState
      ? { txHash: chainState.txHash }
      : await blockchainRelease(milestone._id, amount, freelancerWallet);

    await Transaction.create({
      projectId: milestone.projectId,
      projectTitle: project.title || 'Project',
      milestoneId: milestone._id,
      milestoneTitle: milestone.title,
      type: 'RELEASE',
      amount,
      from: 'Escrow Vault',
      to: freelancerWallet || 'Freelancer',
      txHash: releaseRes.txHash || '',
      status: 'CONFIRMED'
    });
    await syncProjectCompletion(project);

    res.json({
      success: true,
      message: `Timeout elapsed. Released ₹${amount} to the freelancer.`,
      milestone: updated,
      txHash: releaseRes.txHash
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
