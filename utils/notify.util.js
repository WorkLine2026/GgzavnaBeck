// 📂 backend/utils/notify.util.js

const Notification = require('../models/Notification');

// ============================================
// notifyUser
// ============================================
// ყოველთვის ჯერ ინახავს შეტყობინებას DB-ში (რომ არაფერი დაიკარგოს,
// მიმღების ონლაინ/ოფლაინ სტატუსის მიუხედავად), შემდეგ დამატებით
// ცდილობს socket-ით რეალურ დროში მიწოდებას, თუ მიმღები ონლაინშია.
//
// ⚠️ ეს ფუნქცია ცვლის parcel.controller.js-ში ადრე არსებულ
// ლოკალურ notifyUser-ს — გამოძახების ინტერფეისი უცვლელია:
// notifyUser(req, recipientId, { type, title, body, offerId, ... })

async function notifyUser(req, recipientId, payload) {
  if (!recipientId) {
    return;
  }

  try {
    await Notification.create({
      recipientId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      requestId: payload.requestId || null,
      tripId: payload.tripId || null,
      offerId: payload.offerId || null,
      parcelId: payload.parcelId || null
    });
  } catch (e) {
    console.error('❌ notifyUser: DB-ში შენახვა ვერ მოხერხდა:', e);
  }

  try {
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${recipientId}`).emit('notification', payload);
    }
  } catch (e) {
    console.error('❌ notifyUser: socket emit შეცდომა:', e);
  }
}

module.exports = notifyUser;