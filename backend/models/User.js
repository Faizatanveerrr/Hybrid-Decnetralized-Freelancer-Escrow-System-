import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    enum: ['client', 'freelancer'], 
    default: 'client' 
  },
  walletAddress: { 
    type: String, 
    default: '' 
  },
  // 'managed': the platform created and holds the key (encrypted) and signs on the user's behalf.
  // 'external': the user signs with their own wallet (e.g. MetaMask).
  // UPI ID the user withdraws INR to (e.g. name@okhdfcbank)
  upiId: {
    type: String,
    default: ''
  },
  walletType: {
    type: String,
    enum: ['managed', 'external'],
    default: 'external'
  },
  managedWallet: {
    address: { type: String, default: '' },
    encryptedKey: { type: String, select: false, default: '' }
  },
  bio: { 
    type: String, 
    default: '' 
  },
  skills: [{ 
    type: String 
  }],
  links: {
    github: { type: String, default: '' },
    twitter: { type: String, default: '' },
    portfolio: { type: String, default: '' }
  },
  avatar: { 
    type: String, 
    default: '' 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Never serialize the password hash into API responses (covers populate() too).
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.managedWallet; // key material never leaves the server
    return ret;
  }
});

const User = mongoose.model('User', userSchema);
export default User;
