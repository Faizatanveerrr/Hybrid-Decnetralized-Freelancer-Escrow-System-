import mongoose from 'mongoose';
import Project from '../models/Project.js';
import Milestone from '../models/Milestone.js';
import User from '../models/User.js';
import { requireUser, sameId, projectRole } from '../middleware/authHelper.js';
import { isChainEnabled, verifyEscrowMatches, verifyTx } from '../services/chainService.js';

const MAX_MILESTONES = 20; // mirrors MAX_MILESTONES in contracts/EscrowX.vy
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const getProjects = async (req, res) => {
  try {
    const { status, client, freelancer, search } = req.query;
    const query = {};

    if (status && status !== 'ALL') query.status = status;
    if (client && mongoose.isValidObjectId(client)) query.client = client;
    if (freelancer && mongoose.isValidObjectId(freelancer)) query.freelancer = freelancer;
    if (search) {
      query.$or = [
        { title: { $regex: escapeRegex(search), $options: 'i' } },
        { description: { $regex: escapeRegex(search), $options: 'i' } },
        { clientName: { $regex: escapeRegex(search), $options: 'i' } },
        { freelancerName: { $regex: escapeRegex(search), $options: 'i' } }
      ];
    }

    const projects = await Project.find(query).sort({ createdAt: -1 }).populate('milestones');
    res.json({ success: true, projects });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAvailableProjects = async (req, res) => {
  try {
    const projects = await Project.find({
      status: 'OPEN',
      $or: [{ freelancer: null }, { freelancer: { $exists: false } }]
    })
      .sort({ createdAt: -1 })
      .populate('milestones');

    res.json({ success: true, projects });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getProjectById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Invalid project ID' });
    }
    const project = await Project.findById(req.params.id).populate('milestones');
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    res.json({ success: true, project });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createProject = async (req, res) => {
  try {
    // Authenticate first; the acting user is the client (never trust a client id from the body).
    const clientUser = await requireUser(req, res);
    if (!clientUser) return;

    const {
      title,
      description,
      freelancer,
      freelancerName,
      freelancerWallet,
      milestones = []
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and description are required.' });
    }

    if (!Array.isArray(milestones) || milestones.length === 0 || milestones.length > MAX_MILESTONES) {
      return res.status(400).json({ success: false, message: `Provide between 1 and ${MAX_MILESTONES} milestones.` });
    }
    if (milestones.some((m) => !(Number(m.amount) > 0))) {
      return res.status(400).json({ success: false, message: 'Every milestone amount must be a positive number.' });
    }

    let freelancerUser = null;
    if (freelancer && mongoose.isValidObjectId(freelancer)) {
      freelancerUser = await User.findById(freelancer);
    } else if (freelancerWallet) {
      freelancerUser = await User.findOne({ walletAddress: freelancerWallet.trim() });
    }

    const totalAmount = milestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

    const project = new Project({
      title: title.trim(),
      description: description.trim(),
      client: clientUser._id,
      clientName: clientUser.name,
      clientWallet: clientUser.walletAddress || '',
      freelancer: freelancerUser?._id || null,
      freelancerName: freelancerUser?.name || freelancerName || 'Unassigned Freelancer',
      freelancerWallet: freelancerWallet || freelancerUser?.walletAddress || '',
      totalAmount: totalAmount || 0,
      status: freelancerUser ? 'ACTIVE' : 'OPEN'
    });

    await project.save();

    const createdMilestones = [];
    for (const m of milestones) {
      const ms = await Milestone.create({
        projectId: project._id,
        title: m.title ? m.title.trim() : 'Milestone',
        description: m.description ? m.description.trim() : '',
        amount: Number(m.amount) || 0,
        dueDate: m.dueDate || '',
        acceptanceCriteria: m.acceptanceCriteria ? m.acceptanceCriteria.trim() : 'Deliverables approved by client.',
        status: 'PENDING'
      });
      createdMilestones.push(ms._id);
    }

    project.milestones = createdMilestones;
    await project.save();

    const populated = await Project.findById(project._id).populate('milestones');

    res.status(201).json({
      success: true,
      message: 'Project created successfully.',
      project: populated
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateProject = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Invalid project ID' });
    }
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    const existing = await Project.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Project not found' });
    if (!sameId(existing.client, authUser._id)) {
      return res.status(403).json({ success: false, message: 'Only the project client can edit this project.' });
    }

    // Whitelist: parties, wallets, status and amounts are controlled by workflows, not by PUT.
    const patch = {};
    for (const k of ['title', 'description']) {
      if (typeof req.body[k] === 'string' && req.body[k].trim()) patch[k] = req.body[k].trim();
    }
    const updated = await Project.findByIdAndUpdate(req.params.id, patch, { returnDocument: 'after' }).populate('milestones');
    res.json({ success: true, project: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteProject = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Invalid project ID' });
    }
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    const found = await Project.findById(req.params.id);
    if (!found) return res.status(404).json({ success: false, message: 'Project not found' });
    if (!sameId(found.client, authUser._id)) {
      return res.status(403).json({ success: false, message: 'Only the project client can delete this project.' });
    }
    // Deleting a project that holds escrowed funds would orphan them.
    const locked = await Milestone.countDocuments({
      projectId: found._id,
      status: { $in: ['FUNDED', 'SUBMITTED', 'DISPUTED'] }
    });
    if (locked > 0) {
      return res.status(409).json({ success: false, message: 'Cannot delete a project with funds held in escrow. Cancel or resolve those milestones first.' });
    }
    await Project.findByIdAndDelete(req.params.id);
    await Milestone.deleteMany({ projectId: req.params.id });
    res.json({ success: true, message: 'Project removed successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const uploadProjectFile = async (req, res) => {
  try {
    const { name, size } = req.body;
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Invalid project ID' });
    }
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    if (!projectRole(project, authUser)) {
      return res.status(403).json({ success: false, message: 'Only project participants can add files.' });
    }
    const uploadedBy = authUser.name;

    const newFile = {
      name: name || 'file.pdf',
      size: size || '1.0 MB',
      uploadedBy: uploadedBy || 'User',
      uploadedAt: new Date(),
      url: '#'
    };

    project.files.push(newFile);
    await project.save();

    res.json({ success: true, file: newFile, message: 'File uploaded successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Register the EscrowX contract the client deployed from their wallet.
 * The server verifies on-chain that it matches this project before switching
 * the project to on-chain mode.
 */
export const registerEscrow = async (req, res) => {
  try {
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    if (!isChainEnabled()) {
      return res.status(503).json({ success: false, message: 'Blockchain is not configured on the server.' });
    }

    const project = await Project.findById(req.params.id).populate('milestones');
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    if (!sameId(project.client, authUser._id)) {
      return res.status(403).json({ success: false, message: 'Only the project client can register the escrow contract.' });
    }
    if (project.escrowAddress) {
      return res.status(409).json({ success: false, message: 'This project already has an escrow contract.' });
    }
    if (!project.freelancer) {
      return res.status(400).json({ success: false, message: 'Assign a freelancer before deploying the escrow.' });
    }

    const { escrowAddress, txHash } = req.body;
    if (!/^0x[0-9a-fA-F]{40}$/.test(escrowAddress || '')) {
      return res.status(400).json({ success: false, message: 'A valid escrow contract address is required.' });
    }

    const freelancer = await User.findById(project.freelancer);
    const clientWallet = authUser.walletAddress;
    const freelancerWallet = freelancer?.walletAddress;
    if (!clientWallet || !freelancerWallet) {
      return res.status(400).json({ success: false, message: 'Both client and freelancer must have a connected wallet.' });
    }

    // Only milestones that are still pending can be part of a fresh escrow.
    const milestones = project.milestones;
    if (milestones.some((m) => m.status !== 'PENDING')) {
      return res.status(409).json({ success: false, message: 'Milestones were already processed off-chain; deploy the escrow before funding.' });
    }

    try {
      await verifyEscrowMatches(escrowAddress, {
        clientWallet,
        freelancerWallet,
        amounts: milestones.map((m) => m.amount)
      });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    await Promise.all(milestones.map((m, i) => Milestone.findByIdAndUpdate(m._id, { chainIndex: i })));
    project.escrowAddress = escrowAddress;
    project.escrowTxHash = txHash && (await verifyTx(txHash, null).catch(() => false)) ? txHash : '';
    project.clientWallet = clientWallet;
    project.freelancerWallet = freelancerWallet;
    await project.save();

    const updated = await Project.findById(project._id).populate('milestones');
    res.json({ success: true, message: 'Escrow contract verified and linked. This project now settles on-chain.', project: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
