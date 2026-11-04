import express from 'express';
import { getChainConfig } from '../services/chainService.js';
import { executeManagedTx } from '../controllers/chainTxController.js';

const router = express.Router();

// Public chain settings for the frontend (token, arbitrator address, windows...)
router.get('/config', (req, res) => {
  try {
    res.json({ success: true, config: getChainConfig() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Sign + send an on-chain action for users with a platform-managed wallet
router.post('/tx', executeManagedTx);

export default router;
