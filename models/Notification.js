// 📂 backend/models/Notification.js

const mongoose = require('mongoose');

// ============================================
// NOTIFICATION MODEL
// ============================================
// ინახავს ყველა "ზოგად" შეტყობინებას (pickup offer-ები, trip
// pickup request-ები და ა.შ.) — განზრახ არ შეიცავს ჩატის (message)
// ტიპს, რადგან ჩატის შეტყობინებები ცალკე სისტემით იმართება.

const NotificationSchema = new mongoose.Schema({
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  type: {
    type: String,
    required: true,
    enum: [
      'request',
      'trip',
      'status_update',
      'pickup_offer',
      'pickup_offer_accepted',
      'pickup_offer_rejected',
      'pickup_offer_driver_completed',
      'pickup_offer_sender_confirmed',
      'trip_pickup_request',
      'trip_pickup_request_accepted',
      'trip_pickup_request_rejected'
      // ⚠️ განზრახ არ არის აქ 'message'
    ]
  },

  title: {
    type: String,
    required: true
  },
  body: {
    type: String,
    required: true
  },

  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  tripId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  offerId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  parcelId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },

  seen: {
    type: Boolean,
    default: false,
    index: true
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  collection: 'notifications',
  timestamps: false
});

NotificationSchema.index({ recipientId: 1, seen: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, createdAt: -1 });

// ✅ Overwrite-safe: თუ ეს ფაილი (Windows-ზე path-ის case-სხვაობის
// ან hot-reload-ის გამო) ერთზე მეტჯერ "შესრულდა", mongoose.model-ის
// ხელახლა გამოძახება OverwriteModelError-ს ისვრის. ეს guard იყენებს
// უკვე დარეგისტრირებულ მოდელს, თუ ის უკვე არსებობს.
module.exports =
  mongoose.models.Notification ||
  mongoose.model('Notification', NotificationSchema);