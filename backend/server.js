import express from 'express';
import dotenv from 'dotenv';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import mongoose from 'mongoose';
import { connectWithRetry } from './config/db.js';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import milestoneRoutes from './routes/milestoneRoutes.js';
import disputeRoutes from './routes/disputeRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import freelancerRoutes from './routes/freelancerRoutes.js';
import proposalRoutes from './routes/proposalRoutes.js';
import invitationRoutes from './routes/invitationRoutes.js';
import chainRoutes from './routes/chainRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import payoutRoutes from './routes/payoutRoutes.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || process.env.BACKEND_PORT || 5000;

// Connect to MongoDB
connectWithRetry().then((connected) => {
  if (connected) {
    console.log('MongoDB connected successfully.');
  } else {
    console.log('MongoDB is not reachable yet (see the reason above). The app will connect automatically once it is.');
    console.log('Backend server running on port ' + PORT + ' ready to accept connections.');
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/api/health', (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  res.json({
    status: 'online',
    platform: 'EscrowX – Decentralized Freelancer Escrow System',
    port: PORT,
    database: isConnected ? 'MongoDB (Connected)' : 'MongoDB (Disconnected)',
    connected: isConnected
  });
});

// Check MongoDB connection middleware for API routes
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      error: 'DATABASE_UNAVAILABLE',
      message: 'MongoDB is currently unavailable. Please ensure MongoDB is running at ' + 'the configured MONGODB_URI'
    });
  }
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/milestones', milestoneRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/freelancers', freelancerRoutes);
app.use('/api/proposals', proposalRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/chain', chainRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/payouts', payoutRoutes);

// Unknown API routes -> JSON 404
app.use('/api', notFound);

// Serve the built website when it exists (Docker / production). While developing,
// Vite serves the frontend instead, so this is skipped when there is no dist/ folder.
const distDir = fileURLToPath(new URL('../dist', import.meta.url));
if (fs.existsSync(`${distDir}/index.html`)) {
  app.use(express.static(distDir));
  // Single-page app: page URLs (no file extension) return index.html so client-side routes
  // work on refresh. A missing file such as /assets/x.js stays a real 404.
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !/\.[a-zA-Z0-9]+$/.test(req.path)) {
      return res.sendFile(`${distDir}/index.html`);
    }
    next();
  });
}

app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`EscrowX Backend running on port ${PORT}`);
  console.log(`===============================================`);
});

export default app;
