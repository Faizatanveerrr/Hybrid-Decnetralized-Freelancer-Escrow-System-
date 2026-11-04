import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
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
    ref: 'Milestone' 
  },
  milestoneTitle: { 
    type: String, 
    default: '' 
  },
  type: { 
    type: String, 
    enum: ['DEPOSIT', 'RELEASE', 'REFUND', 'DISPUTE_PAYOUT'], 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true 
  },
  from: { 
    type: String, 
    required: true 
  },
  to: { 
    type: String, 
    required: true 
  },
  txHash: { 
    type: String, 
    default: '' 
  },
  status: { 
    type: String, 
    enum: ['PENDING', 'CONFIRMED', 'FAILED'], 
    default: 'CONFIRMED' 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;
