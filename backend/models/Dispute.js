import mongoose from 'mongoose';

const disputeSchema = new mongoose.Schema({
  projectId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Project', 
    required: true 
  },
  projectTitle: { 
    type: String, 
    default: '' 
  },
  milestoneId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Milestone', 
    required: true 
  },
  milestoneTitle: { 
    type: String, 
    default: '' 
  },
  amount: { 
    type: Number, 
    required: true 
  },
  openedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  openedByName: { 
    type: String, 
    default: '' 
  },
  openedByRole: { 
    type: String, 
    enum: ['client', 'freelancer'], 
    default: 'client' 
  },
  clientClaim: { 
    type: String, 
    default: '' 
  },
  freelancerClaim: { 
    type: String, 
    default: '' 
  },
  evidence: [{
    submittedBy: String,
    name: String,
    description: String,
    cid: { type: String, default: '' },   // file stored (encrypted) on IPFS, if any
    date: { type: Date, default: Date.now }
  }],
  // IPFS records of the AI arbitrator's reasoning (also referenced on-chain)
  rulingCid: { type: String, default: '' },
  secondaryRulingCid: { type: String, default: '' },
  acceptanceCriteria: { 
    type: String, 
    default: '' 
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'EVIDENCE_RECEIVED', 'UNDER_AI_REVIEW', 'RULING_GENERATED', 'APPEAL_PERIOD', 'FINALIZED'],
    default: 'ACTIVE'
  },
  aiWinner: { 
    type: String, 
    enum: ['client', 'freelancer', ''], 
    default: '' 
  },
  aiConfidence: { 
    type: Number, 
    default: 0 
  },
  aiReasoning: { 
    type: String, 
    default: '' 
  },
  // Result of running the freelancer's deliverable in the sandbox during escalated review.
  executionStatus: { type: String, default: '' },
  executionSummary: { type: String, default: '' },
  appealPeriodExpires: { 
    type: Date 
  },
  // Mirrors the on-chain rules in contracts/EscrowX.vy:
  //  - confidence >= 70: appeal window opens, finalizable once it closes
  //  - confidence <  70, or appealed: a secondary review is mandatory
  appealed: {
    type: Boolean,
    default: false
  },
  needsSecondaryReview: {
    type: Boolean,
    default: false
  },
  secondaryWinner: {
    type: String,
    enum: ['client', 'freelancer', ''],
    default: ''
  },
  secondaryConfidence: {
    type: Number,
    default: 0
  },
  secondaryReasoning: {
    type: String,
    default: ''
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

const Dispute = mongoose.model('Dispute', disputeSchema);
export default Dispute;
