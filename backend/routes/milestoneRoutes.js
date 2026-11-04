import express from 'express';
import {
  getMilestones,
  getMilestoneById,
  fundMilestone,
  submitWork,
  approveMilestone,
  cancelMilestone,
  claimAfterTimeout
} from '../controllers/milestoneController.js';

const router = express.Router();

router.get('/', getMilestones);
router.get('/:id', getMilestoneById);
router.post('/:id/fund', fundMilestone);
router.post('/:id/submit', submitWork);
router.post('/:id/approve', approveMilestone);
router.post('/:id/cancel', cancelMilestone);
router.post('/:id/claim-timeout', claimAfterTimeout);

export default router;
