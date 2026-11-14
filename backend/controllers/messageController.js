import mongoose from 'mongoose';
import Message, { MAX_MESSAGE_LENGTH } from '../models/Message.js';
import Project from '../models/Project.js';
import { requireUser, projectRole, sameId } from '../middleware/authHelper.js';

/**
 * Project chat. Privacy rule: a conversation belongs to exactly two people, the project's
 * client and its hired freelancer. Everyone else (other users, applicants, even the platform's
 * other logged-in users) gets the same 403 whether the project exists or not.
 * Identity always comes from the login token, never from the request body.
 */

const PAGE_DEFAULT = 100;
const PAGE_MAX = 200;
const RATE_LIMIT = 20;            // messages
const RATE_WINDOW_MS = 60 * 1000; // per minute, per user

const sendTimes = new Map();
const rateLimited = (userId) => {
  const now = Date.now();
  const key = String(userId);
  const recent = (sendTimes.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) { sendTimes.set(key, recent); return true; }
  recent.push(now);
  sendTimes.set(key, recent);
  return false;
};

const fail = (res, code, message) => res.status(code).json({ success: false, message });
const DENIED = 'Only the client and the hired freelancer of this project can use its chat.';

/** Returns { user, project, role, otherId } or null after sending the error response. */
const loadChat = async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return null;
  const { projectId } = req.params;
  if (!mongoose.isValidObjectId(projectId)) { fail(res, 403, DENIED); return null; }
  const project = await Project.findById(projectId);
  const role = projectRole(project, user);
  if (!role) { fail(res, 403, DENIED); return null; }
  return { user, project, role, otherId: role === 'client' ? project.freelancer : project.client };
};

const idStr = (v) => String(v?._id || v || '');

// Only what the UI needs: no read-receipt arrays, no foreign ids besides the sender's.
const serialize = (m, meId, otherId) => {
  const mine = idStr(m.sender) === idStr(meId);
  const readBy = Array.isArray(m.readBy) ? m.readBy.map(idStr) : [];
  return {
    _id: m._id,
    projectId: m.projectId,
    sender: idStr(m.sender),
    senderName: m.senderName,
    senderRole: m.senderRole,
    text: m.text,
    createdAt: m.createdAt,
    mine,
    seen: mine && otherId ? readBy.includes(idStr(otherId)) : false
  };
};

const chatState = (project) => {
  if (!project.freelancer) return { chatOpen: false, closedReason: 'Chat opens once a freelancer is hired for this project.' };
  if (project.status === 'CANCELLED') return { chatOpen: false, closedReason: 'This project was cancelled, so the chat is read-only.' };
  return { chatOpen: true, closedReason: '' };
};

const parseDate = (v) => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

export const getMessagesByProject = async (req, res) => {
  try {
    const ctx = await loadChat(req, res);
    if (!ctx) return;
    const { user, project, otherId } = ctx;

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || PAGE_DEFAULT, 1), PAGE_MAX);
    const after = parseDate(req.query.after);
    const before = parseDate(req.query.before);

    let docs;
    let hasMore = false;
    if (after) {
      // polling: only what is new since the last message the page already has
      docs = await Message.find({ projectId: project._id, createdAt: { $gt: after } }).sort({ createdAt: 1 }).limit(limit);
    } else {
      const q = { projectId: project._id };
      if (before) q.createdAt = { $lt: before };
      const page = await Message.find(q).sort({ createdAt: -1 }).limit(limit + 1);
      hasMore = page.length > limit;
      docs = page.slice(0, limit).reverse();
    }

    // Opening the chat marks the other person's messages as read (not for a background peek).
    if (req.query.peek !== '1') {
      await Message.updateMany(
        { projectId: project._id, sender: { $ne: user._id }, readBy: { $ne: user._id } },
        { $addToSet: { readBy: user._id } }
      );
    }

    // For polling: also tell the page which of MY earlier messages have just been seen.
    let seenIds = [];
    if (after && otherId) {
      const seen = await Message.find({ projectId: project._id, sender: user._id, readBy: otherId, createdAt: { $lte: after } }).select('_id');
      seenIds = seen.map((m) => String(m._id));
    }

    res.json({
      success: true,
      messages: docs.map((m) => serialize(m, user._id, otherId)),
      hasMore,
      seenIds,
      ...chatState(project),
      participants: {
        client: { id: idStr(project.client), name: project.clientName || 'Client' },
        freelancer: project.freelancer ? { id: idStr(project.freelancer), name: project.freelancerName || 'Freelancer' } : null
      }
    });
  } catch (error) {
    fail(res, 500, error.message);
  }
};

export const sendMessage = async (req, res) => {
  try {
    const ctx = await loadChat(req, res);
    if (!ctx) return;
    const { user, project, role, otherId } = ctx;

    const state = chatState(project);
    if (!state.chatOpen) return fail(res, 409, state.closedReason);

    const raw = req.body?.text;
    if (typeof raw !== 'string') return fail(res, 400, 'Message text is required.');
    const text = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
    if (!text) return fail(res, 400, 'Message text is required.');
    if (text.length > MAX_MESSAGE_LENGTH) return fail(res, 400, `Messages can be at most ${MAX_MESSAGE_LENGTH} characters.`);

    if (rateLimited(user._id)) return fail(res, 429, 'You are sending messages too quickly. Please wait a moment.');

    const message = await Message.create({
      projectId: project._id,
      sender: user._id,
      senderName: user.name,
      senderRole: role,
      text,
      readBy: [user._id],
      createdAt: new Date()
    });

    res.status(201).json({ success: true, message: serialize(message, user._id, otherId) });
  } catch (error) {
    fail(res, 500, error.message);
  }
};

// ---------------------------------------------------------------- conversation list

const buildConversations = async (user) => {
  // Only projects where this user is the client or the hired freelancer, and both exist.
  const projects = await Project.find({
    $and: [{ $or: [{ client: user._id }, { freelancer: user._id }] }, { freelancer: { $ne: null } }]
  }).sort({ createdAt: -1 });
  if (!projects.length) return [];

  const stats = await Message.aggregate([
    { $match: { projectId: { $in: projects.map((p) => p._id) } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$projectId',
        last: { $first: '$$ROOT' },
        unread: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ['$sender', user._id] },
                  { $isArray: '$readBy' },
                  { $not: [{ $in: [user._id, { $ifNull: ['$readBy', []] }] }] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    }
  ]);
  const byProject = new Map(stats.map((s) => [String(s._id), s]));

  const list = projects.map((p) => {
    const role = sameId(p.client, user._id) ? 'client' : 'freelancer';
    const s = byProject.get(String(p._id));
    const last = s?.last;
    return {
      projectId: p._id,
      title: p.title,
      status: p.status,
      totalAmount: p.totalAmount,
      role,
      otherName: role === 'client' ? (p.freelancerName || 'Freelancer') : (p.clientName || 'Client'),
      unread: s?.unread || 0,
      lastMessage: last
        ? { text: String(last.text).slice(0, 120), createdAt: last.createdAt, mine: idStr(last.sender) === idStr(user._id), senderName: last.senderName }
        : null,
      sortAt: last?.createdAt || p.createdAt
    };
  });
  list.sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt));
  return list.map(({ sortAt, ...rest }) => rest);
};

export const getConversations = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const conversations = await buildConversations(user);
    res.json({ success: true, conversations, totalUnread: conversations.reduce((n, c) => n + c.unread, 0) });
  } catch (error) {
    fail(res, 500, error.message);
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const conversations = await buildConversations(user);
    res.json({ success: true, totalUnread: conversations.reduce((n, c) => n + c.unread, 0) });
  } catch (error) {
    fail(res, 500, error.message);
  }
};
