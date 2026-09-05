const Notification = require('../models/Notification');

// ყოველთვის ჯერ ინახავს DB-ში (რომ არაფერი დაიკარგოს),
// შემდეგ ცდილობს დამატებით socket-ით real-time მიწოდებას.
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