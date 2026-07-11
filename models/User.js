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
  
  // Angular-ში გაწერილი როლებიდან გამომდინარე ('sender' | 'driver')
  role: { type: String, enum: ['sender', 'driver'], default: 'sender' }, 
  
  phoneVerified: { type: Boolean, default: false },
  smsVerification: { type: smsVerificationSchema, default: undefined },

  // ⬇️ აქ არის დამატებული ველები მძღოლისთვის ⬇️
  carModel: { type: String, default: null },
  
  // sparse: true უზრუნველყოფს იმას, რომ unique შემოწმდეს მხოლოდ მაშინ, როცა ველი შევსებულია
  carPlate: { type: String, unique: true, sparse: true, default: null }, 
  
  driverLicenseNumber: { type: String, default: null }

}, { timestamps: true });

// ✅ პაროლის შედარება bcrypt-ით
userSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.toPublic = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);