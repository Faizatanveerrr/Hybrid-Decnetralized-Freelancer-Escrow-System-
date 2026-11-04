import Milestone from '../models/Milestone.js';
import Project from '../models/Project.js';

const TERMINAL = ['RELEASED', 'REFUNDED', 'CANCELLED'];

/**
 * Mark the project COMPLETED once every milestone has reached a final state
 * and at least one of them actually paid out (released or refunded).
 */
export const syncProjectCompletion = async (projectOrId) => {
  const id = projectOrId?._id || projectOrId;
  const project = await Project.findById(id);
  if (!project) return;
  const milestones = await Milestone.find({ projectId: project._id }, 'status');
  const allDone = milestones.length > 0 && milestones.every((m) => TERMINAL.includes(m.status));
  const anyPaid = milestones.some((m) => ['RELEASED', 'REFUNDED'].includes(m.status));
  if (allDone && anyPaid && project.status === 'ACTIVE') {
    await Project.findByIdAndUpdate(project._id, { status: 'COMPLETED' });
  }
};
