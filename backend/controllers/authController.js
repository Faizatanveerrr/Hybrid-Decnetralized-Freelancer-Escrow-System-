import crypto from 'crypto';
import User from '../models/User.js';
import { hashPassword, verifyPassword, isHashed } from '../utils/password.js';
import { signToken } from '../utils/token.js';
import { ensureManagedWallet } from '../services/walletService.js';
import { requireUser } from '../middleware/authHelper.js';
import { validatePassword } from '../utils/passwordPolicy.js';
import { sendMail, isMailConfigured } from '../services/mailService.js';
import { verifyGoogleCredential, googleClientId, isGoogleConfigured } from '../services/googleAuth.js';

export const register = async (req, res) => {
  try {
    const { name, email, password, role = 'client', walletAddress = '', bio = '', skills = [] } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    const pwCheck = validatePassword(password, { email, name });
    if (!pwCheck.valid) {
      return res.status(400).json({
        success: false,
        message: `Password does not meet requirements: ${pwCheck.errors.join(', ')}.`,
        errors: pwCheck.errors
      });
    }

    // Wallet is optional; if one is supplied it must be a valid address.
    const wallet = String(walletAddress || '').trim();
    if (wallet && !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return res.status(400).json({ success: false, message: 'Wallet address is invalid. Leave it blank to skip.' });
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
      walletAddress: wallet,
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

// ---------------------------------------------------------------- public config

/** What the sign-in page needs to know (nothing secret): is Google sign-in / e-mail reset available? */
export const getAuthConfig = (_req, res) => {
  res.json({
    success: true,
    googleClientId: isGoogleConfigured() ? googleClientId() : '',
    passwordResetEmail: isMailConfigured()
  });
};

// ---------------------------------------------------------------- Google sign-in

const sessionResponse = (res, status, user, message) =>
  res.status(status).json({ success: true, message, user, token: signToken(user._id) });

/**
 * POST /api/auth/google { credential, role? }
 * Existing account (same Google id or same verified e-mail): signs in.
 * New person: needs a role first. Without `role` the answer is { needsRole: true } so the page
 * can ask "client or freelancer?" and call again.
 */
export const googleLogin = async (req, res) => {
  try {
    const { credential, role } = req.body || {};
    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({ success: false, message: 'Google credential is required.' });
    }

    let g;
    try {
      g = await verifyGoogleCredential(credential);
    } catch (err) {
      if (err.code === 'GOOGLE_NOT_CONFIGURED') return res.status(503).json({ success: false, message: err.message });
      return res.status(401).json({ success: false, message: 'Google sign-in failed. Please try again.' });
    }
    if (!g?.sub || !g?.email || !g.emailVerified) {
      return res.status(401).json({ success: false, message: 'Your Google account email is not verified.' });
    }

    const email = String(g.email).trim().toLowerCase();
    let user = await User.findOne({ $or: [{ googleId: g.sub }, { email }] });

    if (user) {
      let changed = false;
      if (!user.googleId) { user.googleId = g.sub; changed = true; }
      if (!user.avatar && g.picture) { user.avatar = g.picture; changed = true; }
      if (changed) await user.save();
      if (!user.walletAddress) await ensureManagedWallet(user).catch((e) => console.error('Managed wallet creation failed:', e.message));
      return sessionResponse(res, 200, user, 'Logged in with Google.');
    }

    if (!role) {
      return res.json({ success: false, needsRole: true, name: g.name || '', email });
    }

    user = await User.create({
      name: (g.name || email.split('@')[0]).trim(),
      email,
      password: hashPassword(crypto.randomBytes(32).toString('hex')),
      role: String(role).toLowerCase() === 'freelancer' ? 'freelancer' : 'client',
      bio: String(role).toLowerCase() === 'freelancer' ? 'Freelance specialist.' : 'Client.',
      avatar: g.picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`,
      authProvider: 'google',
      googleId: g.sub
    });
    await ensureManagedWallet(user).catch((e) => console.error('Managed wallet creation failed:', e.message));
    return sessionResponse(res, 201, user, 'Account created with Google.');
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------------------------------------------------------- forgot / reset password

const RESET_MINUTES = 30;
const THROTTLE_MAX = 5;                 // reset e-mails per address and per IP
const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const throttle = new Map();
const throttled = (key) => {
  const now = Date.now();
  const hits = (throttle.get(key) || []).filter((t) => now - t < THROTTLE_WINDOW_MS);
  if (hits.length >= THROTTLE_MAX) { throttle.set(key, hits); return true; }
  hits.push(now);
  throttle.set(key, hits);
  return false;
};
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

const appBase = (req) => (process.env.APP_URL || req.headers.origin || 'http://localhost:3000').replace(/\/$/, '');
const GENERIC = 'If an account exists for that email, a password reset link has been sent. It is valid for 30 minutes.';

/** POST /api/auth/forgot-password { email } - always answers the same, so it cannot be used to find accounts. */
export const forgotPassword = async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Please enter your email address.' });
    }
    if (throttled('email:' + email) || throttled('ip:' + (req.ip || 'unknown'))) {
      return res.status(429).json({ success: false, message: 'Too many reset requests. Please wait a few minutes and try again.' });
    }

    const user = await User.findOne({ email });
    const out = { success: true, message: GENERIC };
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetTokenHash = sha256(token);
      user.resetTokenExpires = new Date(Date.now() + RESET_MINUTES * 60 * 1000);
      await user.save();

      const link = `${appBase(req)}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
      try {
        await sendMail({
          to: email,
          subject: 'Reset your EscrowX password',
          text: `Hello ${user.name},\n\nUse this link to choose a new password (valid for ${RESET_MINUTES} minutes):\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
          html: `<p>Hello ${String(user.name).replace(/</g, '&lt;')},</p><p><a href="${link}">Choose a new password</a> (valid for ${RESET_MINUTES} minutes).</p><p>If you did not ask for this, you can ignore this email.</p>`
        });
      } catch (mailErr) {
        console.error('Reset email failed:', mailErr.message);
      }
      // Demo convenience ONLY: with no mail server and outside production, show the link on screen.
      if (!isMailConfigured() && process.env.NODE_ENV !== 'production') out.devResetLink = link;
    }
    res.json(out);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** POST /api/auth/reset-password { email, token, password } */
export const resetPassword = async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const token = String(req.body?.token || '');
    const password = String(req.body?.password ?? '');
    const bad = () => res.status(400).json({ success: false, message: 'This reset link is invalid or has expired. Please request a new one.' });
    if (!email || !token) return bad();

    const user = await User.findOne({ email }).select('+resetTokenHash +resetTokenExpires');
    if (!user || !user.resetTokenHash || !user.resetTokenExpires || user.resetTokenExpires.getTime() < Date.now()) return bad();
    const a = Buffer.from(sha256(token));
    const b = Buffer.from(user.resetTokenHash);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return bad();

    const check = validatePassword(password, { email, name: user.name });
    if (!check.valid) {
      return res.status(400).json({ success: false, message: `Password does not meet requirements: ${check.errors.join(', ')}.`, errors: check.errors });
    }

    user.password = hashPassword(password);
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    user.passwordChangedAt = new Date();
    await user.save();
    res.json({ success: true, message: 'Your password has been changed. Please sign in with it.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
