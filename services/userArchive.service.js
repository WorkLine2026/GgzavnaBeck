const DeletedUser = require('../models/DeletedUser');
const DeletedUserMessage = require('../models/DeletedUserMessage');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const {
  Parcel,
  DriverTrip,
  PickupOffer,
  TripPickupRequest,
  Review
} = require('../models');

const MESSAGE_BATCH_SIZE = 1000;
const MAX_NOTIFICATIONS = 500;

/**
 * წაშლამდე ინახავს მომხმარებლის snapshot-ს და მისი ყველა დაკავშირებული
 * ჩანაწერის სრულ ასლს (განცხადებები, მგზავრობები, შეთავაზებები, მოთხოვნები,
 * შეფასებები, შეტყობინებები, ჩატის ისტორია) არქივში.
 *
 * ⚠️ უნდა გამოიძახო ყველანაირი წაშლის/შეცვლის ოპერაციამდე.
 * თუ ეს ფუნქცია შეცდომას ისვრის, გამომძახებელმა წაშლა უნდა შეწყვიტოს.
 * ნაწილობრივი არქივი არ რჩება: შეცდომისას უკვე ჩაწერილი ნაწილი იშლება.
 */
exports.archiveUser = async (user, { deletedBy, deletedById, reason } = {}) => {
  const uid = user._id;
  const snapshot = user.toObject();

  // მგრძნობიარე ველები არქივში არ გადადის
  delete snapshot.password;
  delete snapshot.smsVerification;
  delete snapshot.__v;

  const [
    parcels,
    trips,
    offers,
    tripRequests,
    reviews,
    carriedParcels,
    notifications
  ] = await Promise.all([
    Parcel.find({ senderId: uid }).lean(),
    DriverTrip.find({ driverId: uid }).lean(),
    PickupOffer.find({ $or: [{ senderId: uid }, { driverId: uid }] }).lean(),
    TripPickupRequest.find({ $or: [{ senderId: uid }, { driverId: uid }] }).lean(),
    Review.find({ $or: [{ reviewerId: uid }, { targetId: uid }] }).lean(),
    Parcel.find({ acceptedBy: uid, senderId: { $ne: uid } }).lean(),
    Notification.find({ recipientId: uid })
      .sort({ createdAt: -1 })
      .limit(MAX_NOTIFICATIONS)
      .lean()
  ]);

  const archive = await DeletedUser.create({
    originalId: uid,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    personalNumber: user.personalNumber,
    role: user.role,
    data: snapshot,
    related: {
      parcels,
      trips,
      offers,
      tripRequests,
      reviews,
      carriedParcels,
      notifications
    },
    stats: {
      parcelsCount: parcels.length,
      deliveredParcelsCount: parcels.filter((p) => p.status === 'delivered').length,
      tripsCount: trips.length,
      completedTripsCount: trips.filter((t) => t.status === 'completed').length,
      offersCount: offers.length,
      deliveredOffersCount: offers.filter((o) => o.status === 'delivered').length,
      tripRequestsCount: tripRequests.length,
      reviewsCount: reviews.length,
      notificationsCount: notifications.length,
      messagesCount: 0
    },
    deletedBy,
    deletedById,
    reason: reason ? String(reason).slice(0, 500) : ''
  });

  // ჩატის ისტორია — ცალკე კოლექციაში, პორციებად (დიდი ისტორიის შემთხვევაშიც მუშაობს)
  try {
    const cursor = Message.find({ $or: [{ senderId: uid }, { recipientId: uid }] })
      .sort({ timestamp: 1 })
      .lean()
      .cursor();

    let batch = [];
    let messagesCount = 0;

    for await (const msg of cursor) {
      batch.push({ deletedUserId: archive._id, originalUserId: uid, data: msg });

      if (batch.length >= MESSAGE_BATCH_SIZE) {
        await DeletedUserMessage.insertMany(batch);
        messagesCount += batch.length;
        batch = [];
      }
    }

    if (batch.length > 0) {
      await DeletedUserMessage.insertMany(batch);
      messagesCount += batch.length;
    }

    if (messagesCount > 0) {
      await DeletedUser.updateOne(
        { _id: archive._id },
        { $set: { 'stats.messagesCount': messagesCount } }
      );
      archive.stats.messagesCount = messagesCount;
    }
  } catch (err) {
    // ნაწილობრივი არქივი არ დავტოვოთ, რომ ხელახალ ცდაზე დუბლიკატი არ შეიქმნას
    await Promise.allSettled([
      DeletedUserMessage.deleteMany({ deletedUserId: archive._id }),
      DeletedUser.deleteOne({ _id: archive._id })
    ]);
    throw err;
  }

  return archive;
};