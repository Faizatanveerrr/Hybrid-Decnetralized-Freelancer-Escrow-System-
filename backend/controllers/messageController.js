import mongoose from 'mongoose';
import Message from '../models/Message.js';
import Project from '../models/Project.js';
import { requireUser, projectRole } from '../middleware/authHelper.js';

export const getMessagesByProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!mongoose.isValidObjectId(projectId)) {
      return res.json({ success: true, messages: [] });
    }
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    const project = await Project.findById(projectId);
    if (!project || !projectRole(project, authUser)) {
      return res.status(403).json({ success: false, message: 'Only project participants can read messages.' });
    }
    const messages = await Message.find({ projectId }).sort({ createdAt: 1 });
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { text } = req.body;

    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, message: 'Valid project ID is required.' });
    }

    const authUser = await requireUser(req, res);
    if (!authUser) return;
    const project = await Project.findById(projectId);
    const role = projectRole(project, authUser);
    if (!role) {
      return res.status(403).json({ success: false, message: 'Only project participants can send messages.' });
    }

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Message text is required.' });
    }

    const message = await Message.create({
      projectId,
      sender: authUser._id,
      senderName: authUser.name,
      senderRole: role,
      text: text.trim(),
      createdAt: new Date()
    });

    res.status(201).json({ success: true, message });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
