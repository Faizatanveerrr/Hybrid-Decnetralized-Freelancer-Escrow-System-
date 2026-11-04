import express from 'express';
import {
  getDisputes,
  getDisputeById,
  createDispute,
  addEvidence,
  runAIRuling,
  appealRuling,
  finalizeRuling
} from '../controllers/disputeController.js';

const router = express.Router();

router.get('/', getDisputes);
router.get('/:id', getDisputeById);
router.post('/', createDispute);
router.post('/:id/evidence', addEvidence);
router.post('/:id/ai-ruling', runAIRuling);
router.post('/:id/appeal', appealRuling);
router.post('/:id/finalize', finalizeRuling);

export default router;
