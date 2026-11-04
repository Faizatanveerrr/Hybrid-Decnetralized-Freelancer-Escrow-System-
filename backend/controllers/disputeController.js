import mongoose from 'mongoose';
import Dispute from '../models/Dispute.js';
import Milestone from '../models/Milestone.js';
import Project from '../models/Project.js';
import Transaction from '../models/Transaction.js';
import { analyzeDispute } from '../services/aiService.js';
import { releasePayment } from '../services/blockchainService.js';
import { requireUser, projectRole } from '../middleware/authHelper.js';
import * as chainSvc from '../services/chainService.js';
import { syncProjectCompletion } from '../services/projectService.js';

// Mirrors CONFIDENCE_THRESHOLD in contracts/EscrowX.vy
const CONFIDENCE_THRESHOLD = 70;
const APPEAL_WINDOW_HOURS = 48;

const fail = (res, code, message) => res.status(code).json({ success: false, message });

const chainFail = (res, err) =>
  res.status(502).json({ success: false, message: `Blockchain error: ${chainSvc.friendlyChainError(err)}` });

/** Load dispute + project and ensure the caller is a participant. */
const loadDispute = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    fail(res, 404, 'Invalid dispute ID');
    return null;
  }
  const user = await requireUser(req, res);
  if (!user) return null;

  const dispute = await Dispute.findById(req.params.id);
  if (!dispute) {
    fail(res, 404, 'Dispute not found');
    return null;
  }
  const project = await Project.findById(dispute.projectId);
  const role = projectRole(project, user);
  if (!role) {
    fail(res, 403, 'Only the client or freelancer of this project can access this dispute.');
    return null;
  }
  return { user, dispute, project, role };
};

export const getDisputes = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const { status, projectId } = req.query;
    const mine = await Project.find({ $or: [{ client: user._id }, { freelancer: user._id }] }, '_id');
    const query = { projectId: { $in: mine.map((p) => p._id) } };

    if (projectId && mongoose.isValidObjectId(projectId)) {
      query.projectId = mine.some((p) => String(p._id) === String(projectId)) ? projectId : { $in: [] };
    }

    if (status && status !== 'ALL') {
      if (status === 'ACTIVE') {
        query.status = { $in: ['ACTIVE', 'EVIDENCE_RECEIVED'] };
      } else if (status === 'UNDER_AI_REVIEW') {
        query.status = { $in: ['UNDER_AI_REVIEW', 'RULING_GENERATED'] };
      } else if (status === 'APPEALS') {
        query.status = 'APPEAL_PERIOD';
      } else if (status === 'RESOLVED') {
        query.status = 'FINALIZED';
      } else {
        query.status = status;
      }
    }

    const disputes = await Dispute.find(query).sort({ createdAt: -1 });
    res.json({ success: true, disputes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getDisputeById = async (req, res) => {
  try {
    const ctx = await loadDispute(req, res);
    if (!ctx) return;
    res.json({ success: true, dispute: ctx.dispute });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createDispute = async (req, res) => {
  try {
    const { milestoneId, clientClaim = '', freelancerClaim = '' } = req.body;

    if (!mongoose.isValidObjectId(milestoneId)) {
      return fail(res, 400, 'Valid milestone ID is required.');
    }
    const user = await requireUser(req, res);
    if (!user) return;

    const milestone = await Milestone.findById(milestoneId);
    if (!milestone) return fail(res, 404, 'Milestone not found.');

    const project = await Project.findById(milestone.projectId);
    if (!project) return fail(res, 404, 'Associated project not found.');

    // The opener's role is derived from the project, never from the request body.
    const role = projectRole(project, user);
    if (!role) return fail(res, 403, 'Only the client or freelancer can open a dispute.');

    // Contract rule: disputes only on submitted work, within the review window.
    if (milestone.status !== 'SUBMITTED') {
      return fail(res, 400, `A dispute can only be opened on a submitted milestone (current status: '${milestone.status}').`);
    }
    if (milestone.autoReleaseDeadline && new Date() >= new Date(milestone.autoReleaseDeadline)) {
      return fail(res, 400, 'The review period has expired; this milestone can no longer be disputed.');
    }

    // On-chain projects: the party must already have called raise_dispute from their wallet.
    if (project.escrowAddress) {
      try {
        const state = await chainSvc.readMilestone(project.escrowAddress, milestone.chainIndex);
        if (state.statusName !== 'DISPUTED') {
          return fail(res, 409, `On-chain status is ${state.statusName}. Raise the dispute from your wallet first.`);
        }
        if (!chainSvc.sameAddress(state.disputeRaisedBy, user.walletAddress)) {
          return fail(res, 403, 'The on-chain dispute was not raised by your wallet.');
        }
      } catch (err) {
        return chainFail(res, err);
      }
    }

    // Atomically lock the milestone so only one dispute can ever be opened.
    const locked = await Milestone.findOneAndUpdate(
      { _id: milestone._id, status: 'SUBMITTED' },
      { $set: { status: 'DISPUTED' } },
      { returnDocument: 'after' }
    );
    if (!locked) return fail(res, 409, 'This milestone was just resolved or disputed.');

    const dispute = await Dispute.create({
      projectId: project._id,
      projectTitle: project.title,
      milestoneId: milestone._id,
      milestoneTitle: milestone.title,
      amount: milestone.amount || 0,
      openedBy: user._id,
      openedByName: user.name,
      openedByRole: role,
      // A party can only state its own claim.
      clientClaim: role === 'client' ? String(clientClaim).trim() : '',
      freelancerClaim: role === 'freelancer' ? String(freelancerClaim).trim() : '',
      acceptanceCriteria: milestone.acceptanceCriteria || 'Deliverables verified and accepted.',
      status: 'ACTIVE',
      evidence: []
    });

    res.status(201).json({
      success: true,
      message: 'Dispute initialized. Milestone locked in escrow pending arbitration.',
      dispute
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const addEvidence = async (req, res) => {
  try {
    const ctx = await loadDispute(req, res);
    if (!ctx) return;
    const { dispute, role, user } = ctx;
    const { name, description } = req.body;

    if (dispute.status !== 'ACTIVE' && dispute.status !== 'EVIDENCE_RECEIVED') {
      return fail(res, 409, 'Evidence can only be added before the AI ruling is rendered.');
    }

    dispute.evidence.push({
      submittedBy: role,
      name: name || 'evidence_file.pdf',
      description: description || 'Evidence documentation',
      date: new Date()
    });
    // Fill in the caller's own claim if they have not stated one yet.
    dispute.status = 'EVIDENCE_RECEIVED';
    await dispute.save();

    res.json({ success: true, message: 'Evidence added to case dossier.', dispute });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Runs the AI arbitrator.
 *  - first run (ACTIVE / EVIDENCE_RECEIVED)  -> primary ruling
 *  - run after an appeal, or after a low-confidence primary ruling
 *                                            -> secondary ruling (final)
 */
export const runAIRuling = async (req, res) => {
  try {
    const ctx = await loadDispute(req, res);
    if (!ctx) return;
    const { dispute, project } = ctx;

    const isPrimary = ['ACTIVE', 'EVIDENCE_RECEIVED'].includes(dispute.status);
    const isSecondary =
      !isPrimary &&
      dispute.status !== 'FINALIZED' &&
      !dispute.secondaryWinner &&
      (dispute.appealed || dispute.needsSecondaryReview);

    if (!isPrimary && !isSecondary) {
      return fail(res, 409, dispute.status === 'FINALIZED'
        ? 'This dispute is already finalized.'
        : 'No further AI ruling is available for this dispute in its current state.');
    }

    const milestone = await Milestone.findById(dispute.milestoneId);
    const appealReason = isSecondary ? (dispute.aiReasoning.split('[Appeal Logged').slice(1).join('[Appeal Logged') || '') : '';

    const aiResult = await analyzeDispute({
      projectTitle: project?.title || dispute.projectTitle,
      projectDescription: project?.description || '',
      milestoneTitle: milestone?.title || dispute.milestoneTitle,
      milestoneDescription: milestone?.description || '',
      acceptanceCriteria: dispute.acceptanceCriteria || milestone?.acceptanceCriteria || 'Acceptance criteria verification',
      clientClaim: dispute.clientClaim || 'Deliverables did not meet specification.',
      freelancerClaim: dispute.freelancerClaim || 'Delivered work according to scope.',
      evidence: dispute.evidence || [],
      priorRuling: isSecondary
        ? { winner: dispute.aiWinner, confidence: dispute.aiConfidence, reasoning: dispute.aiReasoning }
        : null,
      appealReason
    });

    // On-chain projects: the platform arbitrator wallet records the ruling in the contract.
    let rulingTxHash = '';
    let chainAppealDeadline = null;
    if (project?.escrowAddress) {
      const idx = milestone?.chainIndex;
      const winnerAddress = aiResult.winner === 'client' ? project.clientWallet : project.freelancerWallet;
      try {
        const tx = await chainSvc.submitRulingOnChain(
          project.escrowAddress, idx, winnerAddress, aiResult.confidence,
          `dispute://${dispute._id}${isSecondary ? '/secondary' : ''}`, isSecondary
        );
        rulingTxHash = tx.txHash;
        if (isPrimary && aiResult.confidence >= CONFIDENCE_THRESHOLD) {
          const r = await chainSvc.readRuling(project.escrowAddress, idx);
          chainAppealDeadline = new Date(r.appealDeadline * 1000);
        }
      } catch (err) {
        return chainFail(res, err);
      }
    }

    if (isPrimary) {
      dispute.status = 'RULING_GENERATED';
      dispute.aiWinner = aiResult.winner;
      dispute.aiConfidence = aiResult.confidence;
      dispute.aiReasoning = aiResult.reasoning;
      if (aiResult.confidence >= CONFIDENCE_THRESHOLD) {
        dispute.appealPeriodExpires = chainAppealDeadline || new Date(Date.now() + APPEAL_WINDOW_HOURS * 3600000);
        dispute.needsSecondaryReview = false;
      } else {
        dispute.appealPeriodExpires = undefined;
        dispute.needsSecondaryReview = true;
      }
    } else {
      dispute.secondaryWinner = aiResult.winner;
      dispute.secondaryConfidence = aiResult.confidence;
      dispute.secondaryReasoning = aiResult.reasoning;
    }
    await dispute.save();

    res.json({
      success: true,
      message: isPrimary
        ? (dispute.needsSecondaryReview
            ? 'AI ruling rendered with low confidence - a secondary review is required before payout.'
            : 'AI Arbitration analysis completed! Ruling rendered.')
        : 'Secondary review completed. This ruling is final.',
      dispute,
      ruling: aiResult,
      txHash: rulingTxHash
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const appealRuling = async (req, res) => {
  try {
    const ctx = await loadDispute(req, res);
    if (!ctx) return;
    const { dispute, user, project } = ctx;
    const { reason } = req.body;

    if (dispute.status !== 'RULING_GENERATED' || !dispute.aiWinner) {
      return fail(res, 409, 'There is no ruling open to appeal.');
    }
    if (dispute.aiConfidence < CONFIDENCE_THRESHOLD) {
      return fail(res, 400, 'Low-confidence rulings go to secondary review automatically and cannot be appealed.');
    }
    if (dispute.appealed) {
      return fail(res, 409, 'This ruling has already been appealed.');
    }
    if (!dispute.appealPeriodExpires || new Date() >= new Date(dispute.appealPeriodExpires)) {
      return fail(res, 400, 'The appeal window has closed.');
    }

    if (project.escrowAddress) {
      try {
        const milestone = await Milestone.findById(dispute.milestoneId);
        const r = await chainSvc.readRuling(project.escrowAddress, milestone.chainIndex);
        if (!r.appealed) {
          return fail(res, 409, 'No appeal found on-chain. Send the appeal transaction from your wallet first.');
        }
      } catch (err) {
        return chainFail(res, err);
      }
    }

    dispute.appealed = true;
    dispute.status = 'APPEAL_PERIOD';
    dispute.aiReasoning = `${dispute.aiReasoning || ''}\n\n[Appeal Logged by ${user.name}]: ${(reason || '').trim() || 'Additional explanation submitted.'}`;
    await dispute.save();

    res.json({
      success: true,
      message: 'Appeal recorded. A secondary AI review is now required.',
      dispute
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const finalizeRuling = async (req, res) => {
  try {
    const ctx = await loadDispute(req, res);
    if (!ctx) return;
    const { dispute, project } = ctx;

    if (dispute.status === 'FINALIZED') return fail(res, 409, 'This dispute is already finalized.');
    if (!dispute.aiWinner) return fail(res, 400, 'No ruling has been rendered yet.');

    // Same decision table as finalize_ruling() on-chain.
    let winner;
    if (dispute.secondaryWinner) {
      winner = dispute.secondaryWinner;
    } else {
      if (dispute.needsSecondaryReview || dispute.aiConfidence < CONFIDENCE_THRESHOLD) {
        return fail(res, 400, 'Low-confidence ruling: a secondary review is required before payout.');
      }
      if (dispute.appealed) {
        return fail(res, 400, 'This ruling was appealed: a secondary review is required before payout.');
      }
      if (!dispute.appealPeriodExpires || new Date() < new Date(dispute.appealPeriodExpires)) {
        return fail(res, 400, `The appeal window is still open until ${dispute.appealPeriodExpires?.toISOString()}.`);
      }
      winner = dispute.aiWinner;
    }

    // On-chain projects: the payout already happened when the party finalized
    // from their wallet; confirm it before updating the database.
    let chainTxHash = '';
    if (project?.escrowAddress) {
      try {
        const milestone = await Milestone.findById(dispute.milestoneId);
        const state = await chainSvc.readMilestone(project.escrowAddress, milestone.chainIndex);
        const expected = winner === 'client' ? 'REFUNDED' : 'RELEASED';
        if (state.statusName !== expected) {
          return fail(res, 409, `On-chain status is ${state.statusName} (expected ${expected}). Send the finalize transaction from your wallet first.`);
        }
        const txHash = req.body?.txHash || '';
        if (txHash && !(await chainSvc.verifyTx(txHash, project.escrowAddress))) {
          return fail(res, 400, 'txHash is not a successful transaction on this escrow contract.');
        }
        chainTxHash = txHash;
      } catch (err) {
        return chainFail(res, err);
      }
    }

    // Atomically claim finalization so the payout can only happen once.
    const claimed = await Dispute.findOneAndUpdate(
      { _id: dispute._id, status: { $ne: 'FINALIZED' } },
      { $set: { status: 'FINALIZED' } },
      { returnDocument: 'after' }
    );
    if (!claimed) return fail(res, 409, 'This dispute was just finalized.');

    const amount = dispute.amount || 0;
    const recipientWallet = winner === 'client' ? (project?.clientWallet || '') : (project?.freelancerWallet || '');
    const releaseRes = project?.escrowAddress
      ? { txHash: chainTxHash }
      : await releasePayment(dispute._id, amount, recipientWallet);

    await Milestone.findByIdAndUpdate(dispute.milestoneId, {
      status: winner === 'client' ? 'REFUNDED' : 'RELEASED',
      releasedAt: new Date()
    });

    await Transaction.create({
      projectId: dispute.projectId,
      projectTitle: dispute.projectTitle,
      milestoneId: dispute.milestoneId,
      milestoneTitle: dispute.milestoneTitle,
      type: winner === 'client' ? 'REFUND' : 'DISPUTE_PAYOUT',
      amount,
      from: 'Escrow Vault',
      to: recipientWallet || (winner === 'client' ? 'Client' : 'Freelancer'),
      txHash: releaseRes.txHash || '',
      status: 'CONFIRMED'
    });
    await syncProjectCompletion(dispute.projectId);

    res.json({
      success: true,
      message: `Dispute finalized. ₹${amount} paid out to the ${winner}.`,
      dispute: claimed,
      txHash: releaseRes.txHash
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
