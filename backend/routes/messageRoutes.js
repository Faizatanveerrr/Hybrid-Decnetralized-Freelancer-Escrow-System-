import express from 'express';
import { getConversations, getUnreadCount, getMessagesByProject, sendMessage } from '../controllers/messageController.js';

const router = express.Router();

// Fixed paths first so they are not read as a project id.
router.get('/', getConversations);
router.get('/unread', getUnreadCount);
router.get('/:projectId', getMessagesByProject);
router.post('/:projectId', sendMessage);

export default router;
