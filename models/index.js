// 📂 backend/models/index.js

const mongoose = require('mongoose');

// ============================================
// PARCEL MODEL - Sender განცხადება
// ============================================

const ParcelSchema = new mongoose.Schema({
  // Sender Info
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  senderName: {
    type: String,
    default: 'უსახელო გამგზავნელი'
  },
  senderPhone: {
    type: String,
    required: true
  },
  senderEmail: {
    type: String,
    default: ''
  },

  // Recipient Info
  recipientPhone: {
    type: String,
    required: true
  },

  // Parcel Details
  from: {
    type: String,
    required: true,
    index: true
  },
  to: {
    type: String,
    required: true,
    index: true
  },
  shipDate: {
    type: Date,
    required: true,
    index: true
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
    default: 'pending',
    index: true
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
    default: Date.now,
    index: true
  },
  acceptedAt: {
    type: Date,
    default: null
  },
  deliveredAt: {
    type: Date,
    default: null
  }
}, {
  collection: 'parcels',
  timestamps: false
});

// ============================================
// DRIVER TRIP MODEL - მძღოლის ტრიპი
// ============================================

const DriverTripSchema = new mongoose.Schema({
  // Driver Info
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Trip Details
  from: {
    type: String,
    required: true,
    index: true
  },
  to: {
    type: String,
    required: true,
    index: true
  },
  departureDate: {
    type: Date,
    required: true,
    index: true
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

  // Driver Contact
  personalNumber: {
    type: String,
    default: ''
  },
  senderPhone: {
    type: String,
    default: ''
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
    enum: ['pending', 'active', 'in-progress', 'completed', 'cancelled'],
    default: 'pending',
    index: true
  },

  // Accepted Shippings
  acceptedShippings: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Parcel'
  }],

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  startedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  }
}, {
  collection: 'driver_trips',
  timestamps: false
});

// ============================================
// INDEXES (Performance Optimization)
// ============================================

ParcelSchema.index({ senderId: 1, status: 1 });
ParcelSchema.index({ from: 1, to: 1, shipDate: 1 });
ParcelSchema.index({ status: 1, createdAt: -1 }); // for public recent requests

DriverTripSchema.index({ driverId: 1, status: 1 });
DriverTripSchema.index({ from: 1, to: 1, departureDate: 1 });
DriverTripSchema.index({ status: 1, createdAt: -1 }); // for public recent trips

// ============================================
// EXPORTS
// ============================================

module.exports = {
  Parcel: mongoose.model('Parcel', ParcelSchema),
  DriverTrip: mongoose.model('DriverTrip', DriverTripSchema)
};