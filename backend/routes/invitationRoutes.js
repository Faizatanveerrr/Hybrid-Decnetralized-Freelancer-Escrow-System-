import express from 'express';
import {
  getInvitations,
  acceptInvitation,
  rejectInvitation
} from '../controllers/invitationController.js';

const router = express.Router();

router.get('/', getInvitations);
router.put('/:id/accept', acceptInvitation);
router.put('/:id/reject', rejectInvitation);

export default router;
