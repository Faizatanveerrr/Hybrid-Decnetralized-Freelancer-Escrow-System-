import mongoose from 'mongoose';
import User from '../models/User.js';
import { verifyToken } from '../utils/token.js';

/**
 * Resolve the acting user from a signed `Authorization: Bearer <token>` header.
 *
 * The old unsigned `x-user-id` header (anyone who knew an id could act as that
 * user) is only honoured when ALLOW_INSECURE_HEADER_AUTH=true, for local debugging.
 */
export const getAuthUser = async (req) => {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const userId = verifyToken(auth.slice(7));
    if (!userId || !mongoose.isValidObjectId(userId)) return null;
    return await User.findById(userId);
  }
  if (process.env.ALLOW_INSECURE_HEADER_AUTH === 'true') {
    const userId = req.headers['x-user-id'];
    if (userId && mongoose.isValidObjectId(userId)) return await User.findById(userId);
  }
  return null;
};

/** Returns the user, or sends a 401 and returns null. */
export const requireUser = async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return null;
  }
  return user;
};

export const sameId = (a, b) => Boolean(a) && Boolean(b) && String(a) === String(b);

/** 'client' | 'freelancer' | null for a user relative to a project. */
export const projectRole = (project, user) => {
  if (!project || !user) return null;
  if (sameId(project.client, user._id)) return 'client';
  if (sameId(project.freelancer, user._id)) return 'freelancer';
  return null;
};
