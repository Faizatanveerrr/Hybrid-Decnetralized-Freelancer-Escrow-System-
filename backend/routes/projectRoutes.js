import express from 'express';
import {
  getProjects,
  getAvailableProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  uploadProjectFile,
  registerEscrow
} from '../controllers/projectController.js';
import {
  createProposal,
  getProjectProposals
} from '../controllers/proposalController.js';
import {
  createInvitation
} from '../controllers/invitationController.js';

const router = express.Router();

router.get('/', getProjects);
router.get('/available', getAvailableProjects);
router.get('/:id', getProjectById);
router.post('/', createProject);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);
router.post('/:id/files', uploadProjectFile);
router.post('/:id/escrow', registerEscrow);

// Project proposals & invitations
router.post('/:projectId/proposals', createProposal);
router.get('/:projectId/proposals', getProjectProposals);
router.post('/:projectId/invitations', createInvitation);

export default router;
