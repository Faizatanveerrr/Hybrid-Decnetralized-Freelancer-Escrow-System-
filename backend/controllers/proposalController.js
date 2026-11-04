import mongoose from 'mongoose';
import Proposal from '../models/Proposal.js';
import Invitation from '../models/Invitation.js';
import Project from '../models/Project.js';
import User from '../models/User.js';
import { getAuthUser } from '../middleware/authHelper.js';

export const createProposal = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { message, proposedAmount } = req.body;

    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, message: 'Valid project ID is required.' });
    }

    const authUser = await getAuthUser(req);
    if (!authUser) {
      return res.status(401).json({ success: false, message: 'Authentication required to submit proposal.' });
    }

    if (authUser.role !== 'freelancer') {
      return res.status(403).json({ success: false, message: 'Only freelancers can submit proposals to projects.' });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Proposal message is required.' });
    }

    const amount = Number(proposedAmount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid positive proposed amount is required.' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    // Edge case 5: Closed/active/completed projects cannot receive new proposals
    if (project.status !== 'OPEN' || project.freelancer) {
      return res.status(400).json({ success: false, message: 'This project is no longer open for proposals.' });
    }

    // Edge case 4: Freelancer cannot apply to their own project
    if (String(project.client) === String(authUser._id)) {
      return res.status(400).json({ success: false, message: 'You cannot submit a proposal to your own project.' });
    }

    // Edge case 1 & 11: Freelancer cannot apply twice to same project (reject duplicate pending/accepted proposals)
    const existing = await Proposal.findOne({
      projectId: project._id,
      freelancerId: authUser._id,
      status: { $in: ['PENDING', 'ACCEPTED'] }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted an active proposal for this project.'
      });
    }

    const proposal = await Proposal.create({
      projectId: project._id,
      freelancerId: authUser._id,
      message: message.trim(),
      proposedAmount: amount,
      status: 'PENDING'
    });

    const populatedProposal = await Proposal.findById(proposal._id)
      .populate('freelancerId', 'name email walletAddress bio skills avatar');

    res.status(201).json({
      success: true,
      message: 'Proposal submitted successfully to client.',
      proposal: populatedProposal
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getProjectProposals = async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, message: 'Valid project ID is required.' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const authUser = await getAuthUser(req);
    if (!authUser) {
      return res.status(401).json({ success: false, message: 'Authentication required to view proposals.' });
    }

    const isClient = String(project.client) === String(authUser._id);
    let proposals = [];

    if (isClient) {
      // Client sees all proposals for their own project
      proposals = await Proposal.find({ projectId: project._id })
        .populate('freelancerId', 'name email walletAddress bio skills avatar')
        .sort({ createdAt: -1 });
    } else {
      // Edge case 9: Freelancer must NOT be able to see other freelancers' proposals. Only their own.
      proposals = await Proposal.find({ projectId: project._id, freelancerId: authUser._id })
        .populate('freelancerId', 'name email walletAddress bio skills avatar')
        .sort({ createdAt: -1 });
    }

    res.json({ success: true, proposals, isClient });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const acceptProposal = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Valid proposal ID is required.' });
    }

    const authUser = await getAuthUser(req);
    if (!authUser) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const proposal = await Proposal.findById(id);
    if (!proposal) {
      return res.status(404).json({ success: false, message: 'Proposal not found.' });
    }

    if (proposal.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: `Cannot accept proposal with status '${proposal.status}'.` });
    }

    const project = await Project.findById(proposal.projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    // Edge case 8: Client cannot accept proposals for another client's project
    if (String(project.client) !== String(authUser._id)) {
      return res.status(403).json({ success: false, message: 'Only the project client can accept proposals.' });
    }

    // Edge case 2: Client cannot accept two freelancers for same project
    if (project.freelancer) {
      return res.status(400).json({ success: false, message: 'A freelancer has already been assigned to this project.' });
    }

    const freelancer = await User.findById(proposal.freelancerId);
    if (!freelancer) {
      return res.status(404).json({ success: false, message: 'Freelancer user not found.' });
    }

    // Assign freelancer to project and activate
    project.freelancer = freelancer._id;
    project.freelancerName = freelancer.name;
    project.freelancerWallet = freelancer.walletAddress || '';
    project.status = 'ACTIVE';
    await project.save();

    // Mark accepted
    proposal.status = 'ACCEPTED';
    proposal.updatedAt = new Date();
    await proposal.save();

    // Edge case 12: Reject other pending proposals and invitations for this project
    await Proposal.updateMany(
      { projectId: project._id, _id: { $ne: proposal._id }, status: 'PENDING' },
      { status: 'REJECTED', updatedAt: new Date() }
    );

    await Invitation.updateMany(
      { projectId: project._id, status: 'PENDING' },
      { status: 'REJECTED', updatedAt: new Date() }
    );

    res.json({
      success: true,
      message: `Proposal accepted! ${freelancer.name} has been assigned to project '${project.title}'.`,
      project,
      proposal
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const rejectProposal = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Valid proposal ID is required.' });
    }

    const authUser = await getAuthUser(req);
    if (!authUser) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const proposal = await Proposal.findById(id);
    if (!proposal) {
      return res.status(404).json({ success: false, message: 'Proposal not found.' });
    }

    if (proposal.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: `Cannot reject proposal with status '${proposal.status}'.` });
    }

    const project = await Project.findById(proposal.projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    if (String(project.client) !== String(authUser._id)) {
      return res.status(403).json({ success: false, message: 'Only the project client can reject proposals.' });
    }

    proposal.status = 'REJECTED';
    proposal.updatedAt = new Date();
    await proposal.save();

    res.json({
      success: true,
      message: 'Proposal has been rejected.',
      proposal
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyProposals = async (req, res) => {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const proposals = await Proposal.find({ freelancerId: authUser._id })
      .populate('projectId', 'title description totalAmount status clientName')
      .sort({ createdAt: -1 });

    res.json({ success: true, proposals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
