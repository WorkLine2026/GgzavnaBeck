const User = require('../models/User');
const ChatMessage = require('../models/Message');
const Notification = require('../models/Notification');
const models = require('../models');
const { Review, PickupOffer, TripPickupRequest } = models;

/* ============================================================
   HELPERS
   ============================================================ */

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getPaging = (query, defaultLimit = 20, maxLimit = 100) => {
  const pageNum = Math.max(parseInt(query.page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  return { pageNum, limitNum, skip: (pageNum - 1) * limitNum };
};

const buildPagination = (total, pageNum, limitNum) => ({
  total,
  page: pageNum,
  limit: limitNum,
  totalPages: Math.max(Math.ceil(total / limitNum), 1)
});

const DELETED_LABEL = 'წაშლილი მომხმარებელი';
const fullName = (u) =>
  u && typeof u === 'object' && (u.firstName || u.lastName)
    ? `${u.firstName || ''} ${u.lastName || ''}`.trim()
    : '';
const idOf = (v) => (v && v._id) || v || null;
const sameId = (a, b) => String(idOf(a)) === String(idOf(b));

const matchUserIds = async (term) => {
  const regex = new RegExp(escapeRegex(term), 'i');
  const users = await User.find({ $or: [{ firstName: regex }, { lastName: regex }] })
    .select('_id')
    .limit(200)
    .lean();
  return users.map((u) => u._id);
};

const PERSON = 'firstName lastName phone';

/* ============================================================
   SHAPERS — populate-ებული ობიექტები → ბრტყელი ველები
   ============================================================ */

const shapeReview = (r) => ({
  ...r,
  reviewerName: fullName(r.reviewerId) || DELETED_LABEL,
  reviewerPhone: (r.reviewerId && r.reviewerId.phone) || '',
  targetName: fullName(r.targetId) || DELETED_LABEL,
  targetPhone: (r.targetId && r.targetId.phone) || '',
  reviewerId: idOf(r.reviewerId),
  targetId: idOf(r.targetId)
});

const shapeNotification = (n) => ({
  ...n,
  recipientName: fullName(n.recipientId) || DELETED_LABEL,
  recipientPhone: (n.recipientId && n.recipientId.phone) || '',
  recipientId: idOf(n.recipientId)
});

const shapeMessage = (m) => ({
  ...m,
  senderName: fullName(m.senderId) || m.senderName || DELETED_LABEL,
  recipientName: fullName(m.recipientId) || (m.recipientId ? DELETED_LABEL : '—'),
  senderId: idOf(m.senderId),
  recipientId: idOf(m.recipientId)
});

/* ============================================================
   REVIEWS
   ============================================================ */

// GET /api/admin/reviews?targetRole=driver|sender&page=1&limit=20
exports.getAllReviewsAdmin = async (req, res) => {
  try {
    const { targetRole } = req.query;
    const { pageNum, limitNum, skip } = getPaging(req.query);

    const query = {};
    if (targetRole && ['driver', 'sender'].includes(targetRole)) query.targetRole = targetRole;

    const [rows, total] = await Promise.all([
      Review.find(query)
        .populate('reviewerId', PERSON)
        .populate('targetId', PERSON)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Review.countDocuments(query)
    ]);

    res.json({
      success: true,
      reviews: rows.map(shapeReview),
      pagination: buildPagination(total, pageNum, limitNum)
    });
  } catch (error) {
    console.error('ADMIN GET REVIEWS ERROR:', error);
    res.status(500).json({ success: false, message: 'შეფასებების ჩატვირთვა ვერ მოხერხდა' });
  }
};

// DELETE /api/admin/reviews/:reviewId  (სურვილისამებრ, მოდერაციისთვის)
exports.forceDeleteReview = async (req, res) => {
  try {
    const doc = await Review.findByIdAndDelete(req.params.reviewId);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'შეფასება ვერ მოიძებნა' });
    }
    res.json({ success: true, message: 'შეფასება წაიშალა (admin)' });
  } catch (error) {
    console.error('ADMIN DELETE REVIEW ERROR:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'შეფასება ვერ მოიძებნა' });
    }
    res.status(500).json({ success: false, message: 'წაშლა ვერ მოხერხდა' });
  }
};

/* ============================================================
   NOTIFICATIONS
   ============================================================ */

// GET /api/admin/notifications?seen=true|false&page=1&limit=20
exports.getAllNotificationsAdmin = async (req, res) => {
  try {
    const { seen } = req.query;
    const { pageNum, limitNum, skip } = getPaging(req.query);

    const query = {};
    if (seen === 'true' || seen === 'false') query.seen = seen === 'true';

    const [rows, total] = await Promise.all([
      Notification.find(query)
        .populate('recipientId', PERSON)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Notification.countDocuments(query)
    ]);

    res.json({
      success: true,
      notifications: rows.map(shapeNotification),
      pagination: buildPagination(total, pageNum, limitNum)
    });
  } catch (error) {
    console.error('ADMIN GET NOTIFICATIONS ERROR:', error);
    res.status(500).json({ success: false, message: 'შეტყობინებების ჩატვირთვა ვერ მოხერხდა' });
  }
};

/* ============================================================
   CHAT MESSAGES (ცოცხალი მომხმარებლების)
   ============================================================ */

// GET /api/admin/messages?isRead=true|false&search=&page=1&limit=50
exports.getAllMessagesAdmin = async (req, res) => {
  try {
    const { isRead, search } = req.query;
    const { pageNum, limitNum, skip } = getPaging(req.query, 50, 200);

    const query = {};
    if (isRead === 'true' || isRead === 'false') query.isRead = isRead === 'true';
    if (search && search.trim()) {
      const term = search.trim();
      const regex = new RegExp(escapeRegex(term), 'i');
      const userIds = await matchUserIds(term);
      query.$or = [
        { message: regex },
        { requestId: regex },
        { senderName: regex },
        { senderId: { $in: userIds } },
        { recipientId: { $in: userIds } }
      ];
    }

    const [rows, total] = await Promise.all([
      ChatMessage.find(query)
        .populate('senderId', PERSON)
        .populate('recipientId', PERSON)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ChatMessage.countDocuments(query)
    ]);

    res.json({
      success: true,
      messages: rows.map(shapeMessage),
      pagination: buildPagination(total, pageNum, limitNum)
    });
  } catch (error) {
    console.error('ADMIN GET MESSAGES ERROR:', error);
    res.status(500).json({ success: false, message: 'ჩატის ჩატვირთვა ვერ მოხერხდა' });
  }
};

/* ============================================================
   USER EXTRAS — ერთი მომხმარებლის დანარჩენი ყველა მონაცემი
   ============================================================ */

// GET /api/admin/users/:userId/extras
exports.getUserExtras = async (req, res) => {
  try {
    const uid = req.params.userId;

    const [
      offers, tripRequests, reviewsGiven, reviewsReceived,
      notifications, messages, messagesCount, notificationsCount
    ] = await Promise.all([
      PickupOffer.find({ $or: [{ driverId: uid }, { senderId: uid }] })
        .populate('parcelId', 'from to weight value status')
        .populate('driverId', PERSON)
        .populate('senderId', PERSON)
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      TripPickupRequest.find({ $or: [{ driverId: uid }, { senderId: uid }] })
        .populate('tripId', 'from to departureDate status')
        .populate('driverId', PERSON)
        .populate('senderId', PERSON)
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      Review.find({ reviewerId: uid })
        .populate('reviewerId', PERSON)
        .populate('targetId', PERSON)
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      Review.find({ targetId: uid })
        .populate('reviewerId', PERSON)
        .populate('targetId', PERSON)
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      Notification.find({ recipientId: uid })
        .populate('recipientId', PERSON)
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      ChatMessage.find({ $or: [{ senderId: uid }, { recipientId: uid }] })
        .populate('senderId', PERSON)
        .populate('recipientId', PERSON)
        .sort({ timestamp: -1 })
        .limit(100)
        .lean(),
      ChatMessage.countDocuments({ $or: [{ senderId: uid }, { recipientId: uid }] }),
      Notification.countDocuments({ recipientId: uid })
    ]);

    res.json({
      success: true,
      offers: offers.map((o) => ({
        ...o,
        role: sameId(o.driverId, uid) ? 'driver' : 'sender',
        parcelRoute: o.parcelId ? `${o.parcelId.from} → ${o.parcelId.to}` : '—',
        parcelStatus: (o.parcelId && o.parcelId.status) || '',
        driverName: fullName(o.driverId) || DELETED_LABEL,
        senderName: fullName(o.senderId) || DELETED_LABEL
      })),
      tripRequests: tripRequests.map((r) => ({
        ...r,
        role: sameId(r.driverId, uid) ? 'driver' : 'sender',
        tripRoute: r.tripId ? `${r.tripId.from} → ${r.tripId.to}` : '—',
        driverName: fullName(r.driverId) || DELETED_LABEL,
        senderName: fullName(r.senderId) || DELETED_LABEL
      })),
      reviewsGiven: reviewsGiven.map(shapeReview),
      reviewsReceived: reviewsReceived.map(shapeReview),
      notifications: notifications.map(shapeNotification),
      messages: messages.map(shapeMessage),
      counts: { messages: messagesCount, notifications: notificationsCount }
    });
  } catch (error) {
    console.error('ADMIN GET USER EXTRAS ERROR:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'მომხმარებელი ვერ მოიძებნა' });
    }
    res.status(500).json({ success: false, message: 'დამატებითი მონაცემების ჩატვირთვა ვერ მოხერხდა' });
  }
};

module.exports = exports;