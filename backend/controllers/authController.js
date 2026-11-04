import User from '../models/User.js';
import { hashPassword, verifyPassword, isHashed } from '../utils/password.js';
import { signToken } from '../utils/token.js';
import { ensureManagedWallet } from '../services/walletService.js';
import { requireUser } from '../middleware/authHelper.js';

export const register = async (req, res) => {
  try {
    const { name, email, password, role = 'client', walletAddress = '', bio = '', skills = [] } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email already exists.' });
    }

    const newUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashPassword(password),
      role: role.toLowerCase() === 'freelancer' ? 'freelancer' : 'client',
      walletAddress: walletAddress.trim(),
      bio: bio || (role === 'freelancer' ? 'Freelance specialist.' : 'Client.'),
      skills: Array.isArray(skills) ? skills : [],
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name.trim())}`
    });

    // New users get a platform-managed wallet unless they supplied their own address.
    if (!newUser.walletAddress) await ensureManagedWallet(newUser).catch((e) => console.error('Managed wallet creation failed:', e.message));

    res.status(201).json({
      success: true,
      message: 'Account registered successfully in MongoDB.',
      user: newUser,
      token: signToken(newUser._id)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Transparently upgrade legacy plaintext passwords on successful login.
    if (!isHashed(user.password)) {
      user.password = hashPassword(password);
      await user.save();
    }

    // Older accounts without any wallet get a managed one on their next login.
    if (!user.walletAddress) await ensureManagedWallet(user).catch((e) => console.error('Managed wallet creation failed:', e.message));

    res.status(200).json({
      success: true,
      message: 'Logged in successfully.',
      user,
      token: signToken(user._id)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMe = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
