import mongoose from 'mongoose';

const milestoneSchema = new mongoose.Schema({
  projectId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Project', 
    required: true 
  },
  title: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String, 
    default: '' 
  },
  amount: { 
    type: Number, 
    required: true 
  },
  dueDate: { 
    type: String, 
    default: '' 
  },
  acceptanceCriteria: { 
    type: String, 
    default: 'Deliverables approved by client.' 
  },
  status: {
    type: String,
    enum: ['PENDING', 'FUNDED', 'SUBMITTED', 'DISPUTED', 'RELEASED', 'REFUNDED', 'CANCELLED'],
    default: 'PENDING'
  },
  // Index of this milestone inside the on-chain escrow (-1 = not on-chain).
  chainIndex: {
    type: Number,
    default: -1
  },
  proof: { 
    type: String, 
    default: '' 
  },
  autoReleaseDeadline: { 
    type: Date 
  },
  fundedAt: { 
    type: Date 
  },
  submittedAt: { 
    type: Date 
  },
  releasedAt: { 
    type: Date 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

const Milestone = mongoose.model('Milestone', milestoneSchema);
export default Milestone;
