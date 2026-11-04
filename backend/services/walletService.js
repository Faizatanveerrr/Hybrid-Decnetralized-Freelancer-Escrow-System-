/**
 * Platform-managed (custodial) wallets: the server generates a key pair for the
 * user, stores the private key AES-256-GCM encrypted, and signs transactions
 * for them. Users can opt out any time and use their own wallet instead.
 */
import { Wallet } from 'ethers';
import User from '../models/User.js';
import Project from '../models/Project.js';
import Milestone from '../models/Milestone.js';
import { encryptSecret, decryptSecret, isEncryptionConfigured } from '../utils/walletCrypto.js';
import { getProvider } from './chainService.js';

export const isManagedEnabled = () => isEncryptionConfigured();

/**
 * Make sure the user has a managed wallet. If `activate` is true and they have
 * no wallet address yet, it also becomes their active wallet.
 */
export const ensureManagedWallet = async (user, { activate = true } = {}) => {
  if (!isManagedEnabled()) return null;
  if (user.managedWallet?.address) {
    if (activate && !user.walletAddress) {
      user.walletAddress = user.managedWallet.address;
      user.walletType = 'managed';
      await user.save();
    }
    return user.managedWallet.address;
  }
  const wallet = Wallet.createRandom();
  user.managedWallet = { address: wallet.address, encryptedKey: encryptSecret(wallet.privateKey) };
  if (activate && !user.walletAddress) {
    user.walletAddress = wallet.address;
    user.walletType = 'managed';
  }
  await user.save();
  return wallet.address;
};

/** Decrypt the user's key and return a signer connected to the chain provider. */
export const getManagedSigner = async (userId) => {
  const user = await User.findById(userId).select('+managedWallet.encryptedKey');
  if (!user?.managedWallet?.encryptedKey) throw new Error('This account has no managed wallet.');
  const signer = new Wallet(decryptSecret(user.managedWallet.encryptedKey), getProvider());
  if (signer.address.toLowerCase() !== user.managedWallet.address.toLowerCase()) {
    throw new Error('Managed wallet key does not match its address.');
  }
  return signer;
};

/**
 * Escrow contracts are bound to the wallet addresses used at deployment, so the
 * wallet cannot be switched while the user still has unfinished on-chain work.
 */
export const hasActiveEscrow = async (userId) => {
  const projects = await Project.find({ escrowAddress: { $ne: '' }, $or: [{ client: userId }, { freelancer: userId }] }, '_id');
  if (!projects.length) return false;
  const open = await Milestone.countDocuments({
    projectId: { $in: projects.map((p) => p._id) },
    status: { $in: ['PENDING', 'FUNDED', 'SUBMITTED', 'DISPUTED'] }
  });
  return open > 0;
};
