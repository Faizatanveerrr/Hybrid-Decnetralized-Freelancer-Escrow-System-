import mongoose from 'mongoose';

// A fiat (UPI / Paytm / card) top-up that is converted 1:1 into INR tokens.
const paymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  wallet: { type: String, required: true },              // address that receives the tokens
  orderId: { type: String, required: true, unique: true }, // Razorpay order id
  paymentId: { type: String, default: '' },               // Razorpay payment id (after payment)
  amount: { type: Number, required: true },               // rupees
  status: {
    type: String,
    // CREATED -> PAID (gateway confirmed) -> MINTING -> MINTED
    enum: ['CREATED', 'PAID', 'MINTING', 'MINTED'],
    default: 'CREATED'
  },
  mintTxHash: { type: String, default: '' },
  gasTxHash: { type: String, default: '' },
  lastError: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
