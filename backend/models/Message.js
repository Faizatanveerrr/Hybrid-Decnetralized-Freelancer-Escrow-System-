import mongoose from 'mongoose';

export const MAX_MESSAGE_LENGTH = 2000;

const messageSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderName: {
    type: String,
    default: ''
  },
  senderRole: {
    type: String,
    enum: ['client', 'freelancer'],
    default: 'client'
  },
  text: {
    type: String,
    required: true,
    maxlength: MAX_MESSAGE_LENGTH
  },
  // 'system' messages are written by the platform (e.g. "Anna selected Ben"), not typed by a person.
  kind: {
    type: String,
    enum: ['user', 'system'],
    default: 'user'
  },
  // Users who have opened this message (the sender counts as having read it).
  // Messages created before this field existed have none and are treated as read.
  readBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

messageSchema.index({ projectId: 1, createdAt: 1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;
