import mongoose from 'mongoose';
import Invitation from '../models/Invitation.js';
import Proposal from '../models/Proposal.js';
import Project from '../models/Project.js';
import User from '../models/User.js';
import { getAuthUser } from '../middleware/authHelper.js';

export const createInvitation = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { freelancerId, message = '' } = req.body;

    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, message: 'Valid project ID is required.' });
    }

    if (!freelancerId || !mongoose.isValidObjectId(freelancerId)) {
      return res.status(400).json({ success: false, message: 'Valid freelancer ID is required.' });
    }

    const authUser = await getAuthUser(req);
    if (!authUser) {
      return res.status(401).json({ success: false, message: 'Authentication required to invite freelancer.' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    // Verify current user is project client
    if (String(project.client) !== String(authUser._id)) {
      return res.status(403).json({ success: false, message: 'Only the project owner can invite freelancers.' });
    }

    // Edge case 6: Closed/active/completed projects cannot receive new invitations
    if (project.status !== 'OPEN' || project.freelancer) {
      return res.status(400).json({ success: false, message: 'Project is already assigned or closed.' });
    }

    // Edge case 3: Client cannot invite themselves
    if (String(authUser._id) === String(freelancerId)) {
      return res.status(400).json({ success: false, message: 'You cannot invite yourself to your project.' });
    }

    const freelancer = await User.findById(freelancerId);
    if (!freelancer || freelancer.role !== 'freelancer') {
      return res.status(400).json({ success: false, message: 'Target user is not a registered freelancer.' });
    }

    // Edge case 10: Reject duplicate pending invitations for same project + freelancer
    const existing = await Invitation.findOne({
      projectId: project._id,
      freelancerId: freelancer._id,
      status: 'PENDING'
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A pending invitation has already been sent to this freelancer for this project.'
      });
    }

    const invitation = await Invitation.create({
      projectId: project._id,
      clientId: authUser._id,
      freelancerId: freelancer._id,
      message: message.trim(),
      status: 'PENDING'
    });

    const populated = await Invitation.findById(invitation._id)
      .populate('projectId', 'title description totalAmount status')
      .populate('freelancerId', 'name email walletAddress avatar');

    res.status(201).json({
      success: true,
      message: `Invitation sent to ${freelancer.name}!`,
      invitation: populated
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getInvitations = async (req, res) => {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return res.status(401).json({ success: false, message: 'Authentication required to view invitations.' });
    }

    let query = {};
    if (authUser.role === 'freelancer') {
      // Freelancer sees invitations sent to them
      query = { freelancerId: authUser._id };
    } else {
      // Client sees invitations they sent
      query = { clientId: authUser._id };
    }

    const invitations = await Invitation.find(query)
      .populate('projectId', 'title description totalAmount status clientName milestones')
      .populate('clientId', 'name email walletAddress avatar')
      .populate('freelancerId', 'name email walletAddress avatar')
      .sort({ createdAt: -1 });

    res.json({ success: true, invitations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const acceptInvitation = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Valid invitation ID is required.' });
    }

    const authUser = await getAuthUser(req);
    if (!authUser) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const invitation = await Invitation.findById(id);
    if (!invitation) {
      return res.status(404).json({ success: false, message: 'Invitation not found.' });
    }

    // Edge case 7: Freelancer cannot accept an invitation meant for another freelancer
    if (String(invitation.freelancerId) !== String(authUser._id)) {
      return res.status(403).json({ success: false, message: 'You are not authorized to accept this invitation.' });
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: `Cannot accept invitation with status '${invitation.status}'.` });
    }

    const project = await Project.findById(invitation.projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    if (project.status !== 'OPEN' || project.freelancer) {
      return res.status(400).json({ success: false, message: 'This project is already assigned or closed.' });
    }

    // Assign freelancer to project and activate
    project.freelancer = authUser._id;
    project.freelancerName = authUser.name;
    project.freelancerWallet = authUser.walletAddress || '';
    project.status = 'ACTIVE';
    await project.save();

    // Mark invitation accepted
    invitation.status = 'ACCEPTED';
    invitation.updatedAt = new Date();
    await invitation.save();

    // Edge case 12: Cancel other pending invitations and proposals for this project
    await Invitation.updateMany(
      { projectId: project._id, _id: { $ne: invitation._id }, status: 'PENDING' },
      { status: 'REJECTED', updatedAt: new Date() }
    );

    await Proposal.updateMany(
      { projectId: project._id, status: 'PENDING' },
      { status: 'REJECTED', updatedAt: new Date() }
    );

    res.json({
      success: true,
      message: `Invitation accepted! You are now assigned to '${project.title}'.`,
      project,
      invitation
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const rejectInvitation = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Valid invitation ID is required.' });
    }

    const authUser = await getAuthUser(req);
    if (!authUser) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const invitation = await Invitation.findById(id);
    if (!invitation) {
      return res.status(404).json({ success: false, message: 'Invitation not found.' });
    }

    if (String(invitation.freelancerId) !== String(authUser._id)) {
      return res.status(403).json({ success: false, message: 'You are not authorized to reject this invitation.' });
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: `Cannot reject invitation with status '${invitation.status}'.` });
    }

    invitation.status = 'REJECTED';
    invitation.updatedAt = new Date();
    await invitation.save();

    res.json({
      success: true,
      message: 'Invitation rejected.',
      invitation
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
