const mongoose = require('mongoose');

// ============================================
// PARCEL MODEL - Sender განცხადება
// ============================================

const ParcelSchema = new mongoose.Schema({
  // Sender Info
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderPhone: {
    type: String,
    required: true
  },

  // Recipient Info
  recipientPhone: {
    type: String,
    required: true
  },

  // Parcel Details
  from: {
    type: String,
    required: true
  },
  to: {
    type: String,
    required: true
  },
  shipDate: {
    type: Date,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  weight: {
    type: Number,
    required: true, // kg
    min: 0.1,
    max: 300
  },
  value: {
    type: Number,
    required: true, // ₾
    min: 1,
    max: 1000000
  },
  notes: {
    type: String,
    default: ''
  },

  // Status Pipeline
  status: {
    type: String,
    enum: ['pending', 'accepted', 'in-transit', 'delivered', 'cancelled'],
    default: 'pending'
  },

  // Driver Info (ერთხელ მძღოლმა მიიღო)
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  acceptedTrip: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DriverTrip',
    default: null
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  acceptedAt: {
    type: Date,
    default: null
  },
  deliveredAt: {
    type: Date,
    default: null
  }
});

// ============================================
// DRIVER TRIP MODEL - მძღოლის ტრიპი
// ============================================

const DriverTripSchema = new mongoose.Schema({
  // Driver Info
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Trip Details
  from: {
    type: String,
    required: true
  },
  to: {
    type: String,
    required: true
  },
  departureDate: {
    type: Date,
    required: true
  },

  // Capacity
  availableSpace: {
    type: Number,
    required: true, // kg
    min: 1,
    max: 1000
  },
  pricePerKg: {
    type: Number,
    required: true,
    min: 0.1
  },

  // Vehicle Info
  carModel: {
    type: String,
    default: ''
  },
  carPlate: {
    type: String,
    default: ''
  },
  comments: {
    type: String,
    default: ''
  },

  // Trip Status
  status: {
    type: String,
    enum: ['active', 'in-progress', 'completed', 'cancelled'],
    default: 'active'
  },

  // Accepted Shippings
  acceptedShippings: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Parcel'
  }],

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  startedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  }
});

// ============================================
// EXPORTS
// ============================================

module.exports = {
  Parcel: mongoose.model('Parcel', ParcelSchema),
  DriverTrip: mongoose.model('DriverTrip', DriverTripSchema)
};