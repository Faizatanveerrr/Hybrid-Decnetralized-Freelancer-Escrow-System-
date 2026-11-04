import express from 'express';
import { getMessagesByProject, sendMessage } from '../controllers/messageController.js';

const router = express.Router();

router.get('/:projectId', getMessagesByProject);
router.post('/:projectId', sendMessage);

export default router;
