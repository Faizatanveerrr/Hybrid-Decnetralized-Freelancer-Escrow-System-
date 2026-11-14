import express from 'express';
import { getConfig, uploadFile, downloadFile, prepareSpec } from '../controllers/ipfsController.js';
import { getMaxBytes } from '../services/ipfsService.js';

const router = express.Router();
router.get('/config', getConfig);
// The file is sent as the raw request body (no multipart library needed).
router.post('/upload', (req, res, next) => express.raw({ type: () => true, limit: getMaxBytes() + 1024 })(req, res, next), uploadFile);
router.post('/spec', prepareSpec);
router.get('/file/:cid', downloadFile);
export default router;
