import express from 'express';
import {
  acceptProposal,
  rejectProposal,
  getMyProposals
} from '../controllers/proposalController.js';

const router = express.Router();

router.get('/my', getMyProposals);
router.put('/:id/accept', acceptProposal);
router.put('/:id/reject', rejectProposal);

export default router;
