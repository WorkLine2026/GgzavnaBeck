// 📂 backend/middleware/upload.middleware.js

const multer = require('multer');

// ✅ memoryStorage — ფაილი დისკზე აღარ ინახება, buffer-ში რჩება
// და პირდაპირ Cloudinary-ზე იტვირთება (Render-ის ephemeral disk-ის პრობლემის გარეშე)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('დასაშვებია მხოლოდ სურათის ფაილები (jpg, png, webp და ა.შ.)'));
  }
  cb(null, true);
};

// ✅ ერთი უნივერსალური uploader — folder-ს (parcels/trips) კონტროლერში ვირჩევთ
const imageUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // ✅ 5MB თითო ფოტოზე
    files: 3                    // ✅ მაქს. 3 ფოტო
  }
});

// ✅ ახალი: მართვის მოწმობის ფოტოსთვის — სურათის გარდა PDF-იც დაშვებულია, ერთი ფაილი
const licenseFileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error('დასაშვებია მხოლოდ JPG, PNG ან PDF ფაილი'));
  }
  cb(null, true);
};

const licenseUpload = multer({
  storage,
  fileFilter: licenseFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  }
});

module.exports = { imageUpload, licenseUpload };