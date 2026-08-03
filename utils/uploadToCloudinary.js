// 📂 backend/utils/uploadToCloudinary.js

const cloudinary = require('../config/cloudinary');

/**
 * ✅ ატვირთავს ერთ ფაილის buffer-ს Cloudinary-ზე (memory-დან, დისკზე შენახვის გარეშე)
 * და აბრუნებს მუდმივ https URL-ს, რომელიც უსაფრთხოდ შეინახება Mongo-ში.
 *
 * @param {Buffer} buffer - ფაილის ბინარული მონაცემი (multer memoryStorage-იდან, file.buffer)
 * @param {string} folder - Cloudinary-ის ფოლდერი, მაგ. 'ggzavna/parcels' ან 'ggzavna/trips'
 * @returns {Promise<string>} secure_url
 */
function uploadBufferToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        // ✅ ავტომატური ოპტიმიზაცია — ზომაში/ხარისხში დაზოგვისთვის
        transformation: [{ quality: 'auto', fetch_format: 'auto' }]
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        resolve(result.secure_url);
      }
    );

    stream.end(buffer);
  });
}

/**
 * ✅ ატვირთავს რამდენიმე ფაილს პარალელურად და აბრუნებს URL-ების მასივს
 * @param {Express.Multer.File[]} files
 * @param {string} folder
 * @returns {Promise<string[]>}
 */
async function uploadManyToCloudinary(files, folder) {
  if (!files || files.length === 0) {
    return [];
  }
  return Promise.all(files.map((file) => uploadBufferToCloudinary(file.buffer, folder)));
}

module.exports = { uploadBufferToCloudinary, uploadManyToCloudinary };