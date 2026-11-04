import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String, 
    required: true 
  },
  client: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  clientName: { 
    type: String, 
    default: '' 
  },
  clientWallet: { 
    type: String, 
    default: '' 
  },
  freelancer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null 
  },
  freelancerName: { 
    type: String, 
    default: '' 
  },
  freelancerWallet: { 
    type: String, 
    default: '' 
  },
  // Set once the client deploys the EscrowX contract for this job.
  // While empty the project runs in the legacy (database only) mode.
  escrowAddress: {
    type: String,
    default: ''
  },
  escrowTxHash: {
    type: String,
    default: ''
  },
  totalAmount: { 
    type: Number, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['OPEN', 'ACTIVE', 'COMPLETED', 'DISPUTED', 'CANCELLED'], 
    default: 'OPEN' 
  },
  milestones: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Milestone' 
  }],
  files: [{
    name: String,
    size: String,
    uploadedBy: String,
    uploadedAt: { type: Date, default: Date.now },
    url: String
  }],
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

const Project = mongoose.model('Project', projectSchema);
export default Project;
