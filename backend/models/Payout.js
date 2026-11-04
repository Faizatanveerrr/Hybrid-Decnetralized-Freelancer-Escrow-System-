import mongoose from 'mongoose';

// A withdrawal: INR tokens are taken from the user's wallet and the same amount
// of rupees is paid out to their UPI ID.
const payoutSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  wallet: { type: String, required: true },
  amount: { type: Number, required: true },               // rupees
  vpa: { type: String, required: true },                  // destination UPI ID
  status: {
    type: String,
    // REQUESTED -> COLLECTED (tokens taken) -> PROCESSING -> PROCESSED
    //                         \-> FAILED -> REFUNDING -> REFUNDED   (tokens returned)
    // REQUESTED -> CANCELLED (tokens could not be collected)
    enum: ['REQUESTED', 'COLLECTED', 'PROCESSING', 'PROCESSED', 'FAILED', 'REFUNDING', 'REFUNDED', 'CANCELLED'],
    default: 'REQUESTED'
  },
  mode: { type: String, enum: ['simulated', 'razorpayx'], required: true },
  idempotencyKey: { type: String, required: true, unique: true },
  collectTxHash: { type: String, unique: true, sparse: true }, // one transfer can back only one payout
  refundTxHash: { type: String, default: '' },
  gatewayPayoutId: { type: String, default: '' },
  utr: { type: String, default: '' },
  lastError: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const Payout = mongoose.model('Payout', payoutSchema);
export default Payout;
