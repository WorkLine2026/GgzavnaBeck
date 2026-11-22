const mongoose = require('mongoose');

// წაშლილი მომხმარებლის ჩატის შეტყობინებების არქივი.
// ცალკე კოლექციაშია (თითო შეტყობინება = თითო დოკუმენტი), რადგან
// ჩატის ისტორია შეიძლება დიდი იყოს და DeletedUser-ის ერთ დოკუმენტში
// (MongoDB-ის ლიმიტი 16 MB) ვერ ჩაეტეს.

const deletedUserMessageSchema = new mongoose.Schema({
  deletedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeletedUser',
    required: true,
    index: true
  },
  originalUserId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  // ორიგინალი ChatMessage ჩანაწერი (requestId, senderId, recipientId,
  // message, timestamp, isRead და ა.შ.)
  data: { type: mongoose.Schema.Types.Mixed, required: true }
});

module.exports =
  mongoose.models.DeletedUserMessage ||
  mongoose.model('DeletedUserMessage', deletedUserMessageSchema);