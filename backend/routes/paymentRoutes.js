import express from 'express';
import { getPaymentConfig, createPaymentOrder, verifyPayment, listMyPayments } from '../controllers/paymentController.js';

const router = express.Router();
router.get('/config', getPaymentConfig);
router.get('/mine', listMyPayments);
router.post('/order', createPaymentOrder);
router.post('/verify', verifyPayment);
export default router;
