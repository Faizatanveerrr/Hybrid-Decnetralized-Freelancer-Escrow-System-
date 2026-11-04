import express from 'express';
import { getPayoutConfig, createPayout, listMyPayouts, validatePayout } from '../controllers/payoutController.js';

const router = express.Router();
router.get('/config', getPayoutConfig);
router.get('/mine', listMyPayouts);
router.post('/validate', validatePayout);
router.post('/', createPayout);
export default router;
