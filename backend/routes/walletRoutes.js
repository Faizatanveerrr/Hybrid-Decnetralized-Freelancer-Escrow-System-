import express from 'express';
import { getWalletInfo, getTransactions, useManagedWallet } from '../controllers/walletController.js';

const router = express.Router();

router.post('/use-managed', useManagedWallet);
router.get('/:userId', getWalletInfo);
router.get('/transactions/:userId', getTransactions);

export default router;
