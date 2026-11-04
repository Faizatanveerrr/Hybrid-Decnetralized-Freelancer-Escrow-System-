import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import Milestone from '../models/Milestone.js';
import Project from '../models/Project.js';
import { requireUser, sameId } from '../middleware/authHelper.js';
import { isChainEnabled, getInrBalanceOf } from '../services/chainService.js';
import { ensureManagedWallet, isManagedEnabled, hasActiveEscrow } from '../services/walletService.js';

export const getWalletInfo = async (req, res) => {
  try {
    const { userId } = req.params;
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    if (!sameId(authUser._id, userId)) {
      return res.status(403).json({ success: false, message: 'You can only view your own wallet.' });
    }
    let user = null;

    if (mongoose.isValidObjectId(userId)) {
      user = await User.findById(userId);
    }

    if (!user) {
      return res.json({
        success: true,
        wallet: {
          address: '',
          balanceUSDC: 0,
          lockedEscrowUSDC: 0,
          network: 'Not Connected',
          currency: 'INR'
        }
      });
    }

    // Accounts that predate managed wallets get one automatically.
    if (!user.walletAddress) await ensureManagedWallet(user).catch(() => {});
    const walletAddress = user.walletAddress || '';

    // Real INR token balance straight from the blockchain (null if unavailable)
    let onChainBalance = null;
    if (walletAddress && isChainEnabled()) {
      onChainBalance = await getInrBalanceOf(walletAddress).catch(() => null);
    }

    // Calculate real locked escrow from actual milestones in MongoDB
    let lockedEscrowUSDC = 0;
    if (user.role === 'client') {
      const clientProjects = await Project.find({ client: user._id });
      const projectIds = clientProjects.map(p => p._id);
      const lockedMilestones = await Milestone.find({
        projectId: { $in: projectIds },
        status: { $in: ['FUNDED', 'SUBMITTED', 'DISPUTED'] }
      });
      lockedEscrowUSDC = lockedMilestones.reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
    } else {
      const freelancerProjects = await Project.find({ freelancer: user._id });
      const projectIds = freelancerProjects.map(p => p._id);
      const lockedMilestones = await Milestone.find({
        projectId: { $in: projectIds },
        status: { $in: ['FUNDED', 'SUBMITTED', 'DISPUTED'] }
      });
      lockedEscrowUSDC = lockedMilestones.reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
    }

    res.json({
      success: true,
      wallet: {
        address: walletAddress,
        balanceUSDC: 0,
        onChainBalance,
        walletType: user.walletType || 'external',
        managedAvailable: isManagedEnabled(),
        lockedEscrowUSDC,
        network: walletAddress ? 'Sepolia Testnet' : 'Not Connected',
        currency: 'INR'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getTransactions = async (req, res) => {
  try {
    const { userId } = req.params;
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    if (!sameId(authUser._id, userId)) {
      return res.status(403).json({ success: false, message: 'You can only view your own transactions.' });
    }
    let transactions = [];

    if (mongoose.isValidObjectId(userId)) {
      const user = await User.findById(userId);
      if (user?.walletAddress) {
        transactions = await Transaction.find({
          $or: [{ from: user.walletAddress }, { to: user.walletAddress }]
        }).sort({ createdAt: -1 });
      }
    }

    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Switch the account back to its platform-managed wallet (no MetaMask needed). */
export const useManagedWallet = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!isManagedEnabled()) {
      return res.status(503).json({ success: false, message: 'Managed wallets are not enabled on this server.' });
    }
    if (await hasActiveEscrow(user._id)) {
      return res.status(409).json({ success: false, message: 'You have unfinished on-chain projects. Finish or cancel them before switching wallets.' });
    }
    const address = await ensureManagedWallet(user, { activate: false });
    user.walletAddress = address;
    user.walletType = 'managed';
    await user.save();
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
