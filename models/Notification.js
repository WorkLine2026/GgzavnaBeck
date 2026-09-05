const mongoose = require('mongoose');

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
      // ⚠️ განზრახ არ არის აქ 'message' — ჩატის შეტყობინებები არ ინახება/არ იგზავნება ცალკე
    ]
  },

  title: { type: String, required: true },
  body: { type: String, required: true },

  requestId: { type: mongoose.Schema.Types.ObjectId, default: null },
  tripId: { type: mongoose.Schema.Types.ObjectId, default: null },
  offerId: { type: mongoose.Schema.Types.ObjectId, default: null },
  parcelId: { type: mongoose.Schema.Types.ObjectId, default: null },

  seen: { type: Boolean, default: false, index: true },

  createdAt: { type: Date, default: Date.now, index: true }
}, {
  collection: 'notifications',
  timestamps: false
});

NotificationSchema.index({ recipientId: 1, seen: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);