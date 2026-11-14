import mongoose from 'mongoose';

// Metadata for a file stored on IPFS. The bytes on IPFS are ENCRYPTED; this record
// says which project they belong to, so only that project's participants can decrypt.
const ipfsObjectSchema = new mongoose.Schema({
  cid: { type: String, required: true, unique: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['deliverable', 'evidence', 'spec', 'ruling'], required: true },
  name: { type: String, default: 'file' },
  mime: { type: String, default: 'application/octet-stream' },
  size: { type: Number, default: 0 },          // size of the original (decrypted) file
  provider: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const IpfsObject = mongoose.model('IpfsObject', ipfsObjectSchema);
export default IpfsObject;
