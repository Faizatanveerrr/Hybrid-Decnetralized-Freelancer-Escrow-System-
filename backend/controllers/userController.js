import mongoose from 'mongoose';
import User from '../models/User.js';
import { requireUser, sameId } from '../middleware/authHelper.js';
import { hasActiveEscrow } from '../services/walletService.js';
import { sameAddress } from '../services/chainService.js';

export const getUserById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Invalid user ID' });
    }
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Invalid user ID' });
    }
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    if (!sameId(authUser._id, req.params.id)) {
      return res.status(403).json({ success: false, message: 'You can only edit your own profile.' });
    }

    // Only defined fields are applied, so a partial update cannot wipe others.
    const patch = {};
    for (const [k, v] of Object.entries({ name: req.body.name, bio: req.body.bio, skills: req.body.skills, walletAddress: req.body.walletAddress, links: req.body.links, avatar: req.body.avatar, upiId: req.body.upiId, role: req.body.role })) {
      if (v !== undefined) patch[k] = v;
    }
    // The active mode ("client" / "freelancer"). Per-project permissions still depend on the
    // project's actual client and freelancer; this only gates things like sending proposals.
    if (patch.role !== undefined && !['client', 'freelancer'].includes(patch.role)) {
      return res.status(400).json({ success: false, message: "Role must be 'client' or 'freelancer'." });
    }

    // Escrow contracts are bound to wallet addresses, so changing wallet is blocked mid-project.
    if (patch.walletAddress !== undefined && patch.walletAddress !== authUser.walletAddress) {
      if (await hasActiveEscrow(authUser._id)) {
        return res.status(409).json({ success: false, message: 'You have unfinished on-chain projects. Finish or cancel them before switching wallets.' });
      }
      // A wallet the user connects themselves is 'external', unless it is their managed one.
      patch.walletType = sameAddress(patch.walletAddress, authUser.managedWallet?.address) ? 'managed' : 'external';
    }
    // Load -> modify -> save (only changed fields are written; key material is never touched).
    authUser.set(patch);
    const updated = await authUser.save();
    res.json({ success: true, user: updated, message: 'Profile updated successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
