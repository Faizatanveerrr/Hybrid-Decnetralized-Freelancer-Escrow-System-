import mongoose from 'mongoose';

// Storage for the 'local' IPFS provider (demo mode without an IPFS node).
const ipfsBlobSchema = new mongoose.Schema({
  cid: { type: String, required: true, unique: true },
  data: { type: Buffer, required: true }
});

const IpfsBlob = mongoose.model('IpfsBlob', ipfsBlobSchema);
export default IpfsBlob;
