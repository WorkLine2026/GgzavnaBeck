const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const smsVerificationSchema = new mongoose.Schema(
  {
    code: { type: String, select: false },
    expiresAt: { type: Date, select: false },
    attempts: { type: Number, default: 0, select: false },
    reference: { type: String, select: false }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  personalNumber: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, unique: true, index: true },
  phone: { type: String, required: true, unique: true, index: true },
  password: { type: String, required: true },

  // ✅ NEW: 'admin' დამატებულია. register() endpoint მაინც არ უშვებს
  // 'admin'-ის შექმნას (იხ. auth.controller.js) — admin მხოლოდ
  // scripts/createAdmin.js-ით ან სხვა admin-ის მიერ იქმნება.
  role: { type: String, enum: ['sender', 'driver', 'admin'], default: 'sender' },

  // ✅ NEW: admin-ს user-ის დაბლოკვა/გააქტიურება რომ შეეძლოს
  isBanned: { type: Boolean, default: false },
  bannedReason: { type: String, default: '' },

  phoneVerified: { type: Boolean, default: false },
  smsVerification: { type: smsVerificationSchema, default: undefined },

  // ⬇️ მძღოლის ველები ⬇️
  carModel: { type: String },
  carPlate: { type: String, unique: true, sparse: true },
  driverLicenseNumber: { type: String },
  driverLicensePhotoUrl: { type: String }

}, { timestamps: true });

userSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.toPublic = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);