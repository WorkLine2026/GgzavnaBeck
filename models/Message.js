const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      required: true,
      index: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    senderName: {
      type: String,
      default: 'უცნობი'
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    message: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    isRead: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// ინდექსი სწრაფი ძებნისთვის
ChatMessageSchema.index({ requestId: 1, timestamp: -1 });
ChatMessageSchema.index({ senderId: 1, recipientId: 1 });

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);