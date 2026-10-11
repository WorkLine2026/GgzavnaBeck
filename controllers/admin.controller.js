const User = require('../models/User');
const models = require('../models');
const { Parcel, DriverTrip } = models;
// ⚠️ თუ ეს ორი მოდელი ../models/index.js-იდან არ იგზავნება, პირდაპირ იტვირთება ფაილიდან.
// შეამოწმე, რომ models/PickupOffer.js და models/TripPickupRequest.js არსებობს
const PickupOffer = models.PickupOffer || require('../models/PickupOffer');
const TripPickupRequest = models.TripPickupRequest || require('../models/TripPickupRequest');

/* ============================================================
   HELPERS
   ============================================================ */

// search ტექსტი უსაფრთხო regex-ად (სხვანაირად "(" ან "[" შეცდომას აგდებდა)
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getPaging = (query) => {
  const pageNum = Math.max(parseInt(query.page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  return { pageNum, limitNum, skip: (pageNum - 1) * limitNum };
};

const buildPagination = (total, pageNum, limitNum) => ({
  total,
  page: pageNum,
  limit: limitNum,
  totalPages: Math.max(Math.ceil(total / limitNum), 1)
});

const fullName = (u) => (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '');

// სახელით ძებნისთვის: პოულობს user-ების id-ებს (სახელი ან გვარი)
const matchUserIds = async (term) => {
  const regex = new RegExp(escapeRegex(term), 'i');
  const users = await User.find({ $or: [{ firstName: regex }, { lastName: regex }] })
    .select('_id')
    .limit(200)
    .lean();
  return users.map((u) => u._id);
};

// populate-ებული senderId → ბრტყელი ველები frontend-ისთვის
const shapeRequest = (r) => ({
  ...r,
  senderName: fullName(r.senderId) || r.senderName || 'უცნობი გამგზავნი',
  senderPhone: r.senderPhone || (r.senderId && r.senderId.phone) || '',
  senderEmail: r.senderEmail || (r.senderId && r.senderId.email) || '',
  senderId: (r.senderId && r.senderId._id) || r.senderId
});

const shapeTrip = (t) => ({
  ...t,
  driverName: fullName(t.driverId) || t.driverName || 'უცნობი მძღოლი',
  senderPhone: t.senderPhone || (t.driverId && t.driverId.phone) || '',
  driverId: (t.driverId && t.driverId._id) || t.driverId
});

const byStatus = async (Model) => {
  const rows = await Model.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [r._id || 'unknown', r.count]));
};

const REQUEST_STATUSES = ['pending', 'accepted', 'in-transit', 'delivered', 'cancelled'];
const TRIP_STATUSES = ['pending', 'active', 'in-progress', 'completed', 'cancelled'];
const PERSON_FIELDS = 'firstName lastName phone carModel carPlate';

/* ============================================================
   DASHBOARD STATS
   ============================================================ */

exports.getDashboardStats = async (req, res) => {
  try {
    const last7 = { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } };

    const [
      totalUsers, totalSenders, totalDrivers, totalAdmins, bannedUsers, newUsers,
      totalRequests, requestsByStatus, newRequests, valueAgg,
      totalTrips, tripsByStatus, newTrips,
      totalOffers, offersByStatus,
      totalTripRequests, tripRequestsByStatus,
      recentRequests, recentTrips, recentUsers
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'sender' }),
      User.countDocuments({ role: 'driver' }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ isBanned: true }),
      User.countDocuments(last7),
      Parcel.countDocuments(),
      byStatus(Parcel),
      Parcel.countDocuments(last7),
      Parcel.aggregate([{ $group: { _id: null, sum: { $sum: '$value' } } }]),
      DriverTrip.countDocuments(),
      byStatus(DriverTrip),
      DriverTrip.countDocuments(last7),
      PickupOffer.countDocuments(),
      byStatus(PickupOffer),
      TripPickupRequest.countDocuments(),
      byStatus(TripPickupRequest),
      Parcel.find().populate('senderId', 'firstName lastName phone email').sort({ createdAt: -1 }).limit(5).lean(),
      DriverTrip.find().populate('driverId', 'firstName lastName phone').sort({ createdAt: -1 }).limit(5).lean(),
      User.find().select('-password').sort({ createdAt: -1 }).limit(5).lean()
    ]);

    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          senders: totalSenders,
          drivers: totalDrivers,
          admins: totalAdmins,
          blocked: bannedUsers,
          newLast7Days: newUsers
        },
        requests: {
          total: totalRequests,
          byStatus: requestsByStatus,
          newLast7Days: newRequests,
          totalValue: (valueAgg[0] && valueAgg[0].sum) || 0
        },
        trips: { total: totalTrips, byStatus: tripsByStatus, newLast7Days: newTrips },
        offers: { total: totalOffers, byStatus: offersByStatus },
        tripRequests: { total: totalTripRequests, byStatus: tripRequestsByStatus },
        recent: {
          requests: recentRequests.map(shapeRequest),
          trips: recentTrips.map(shapeTrip),
          users: recentUsers
        }
      }
    });
  } catch (error) {
    console.error('ADMIN STATS ERROR:', error);
    res.status(500).json({ success: false, message: 'სტატისტიკის ჩატვირთვა ვერ მოხერხდა' });
  }
};

/* ============================================================
   USERS MANAGEMENT
   ============================================================ */

// GET /api/admin/users?role=driver&search=giorgi&page=1&limit=20
exports.getAllUsers = async (req, res) => {
  try {
    const { role, search } = req.query;
    const { pageNum, limitNum, skip } = getPaging(req.query);

    const query = {};
    if (role && ['sender', 'driver', 'admin'].includes(role)) {
      query.role = role;
    }
    if (search && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { phone: regex },
        { personalNumber: regex },
        { carPlate: regex }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      User.countDocuments(query)
    ]);

    res.json({ success: true, users, pagination: buildPagination(total, pageNum, limitNum) });
  } catch (error) {
    console.error('ADMIN GET USERS ERROR:', error);
    res.status(500).json({ success: false, message: 'მომხმარებლების ჩატვირთვა ვერ მოხერხდა' });
  }
};

// GET /api/admin/users/:userId  — პროფილი + მისი განცხადებები და მგზავრობები
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'მომხმარებელი ვერ მოიძებნა' });
    }

    const [requests, trips, requestsCount, tripsCount, offersAsDriver, offersAsSender] = await Promise.all([
      Parcel.find({ senderId: user._id }).sort({ createdAt: -1 }).limit(50).lean(),
      DriverTrip.find({ driverId: user._id }).sort({ createdAt: -1 }).limit(50).lean(),
      Parcel.countDocuments({ senderId: user._id }),
      DriverTrip.countDocuments({ driverId: user._id }),
      PickupOffer.countDocuments({ driverId: user._id }),
      PickupOffer.countDocuments({ senderId: user._id })
    ]);

    res.json({
      success: true,
      user: { ...user, requestsCount, tripsCount },
      requests,
      trips,
      offers: { asDriver: offersAsDriver, asSender: offersAsSender }
    });
  } catch (error) {
    console.error('ADMIN GET USER BY ID ERROR:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'მომხმარებელი ვერ მოიძებნა' });
    }
    res.status(500).json({ success: false, message: 'მომხმარებლის ჩატვირთვა ვერ მოხერხდა' });
  }
};

// PUT /api/admin/users/:userId/role   body: { role: 'driver' }
exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!['sender', 'driver', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'არასწორი role' });
    }

    if (req.params.userId === String(req.userId) && role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'საკუთარი admin role-ის ჩამოცილება საკუთარი ანგარიშიდან არ შეიძლება'
      });
    }

    const user = await User.findByIdAndUpdate(req.params.userId, { role }, { new: true }).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'მომხმარებელი ვერ მოიძებნა' });
    }

    res.json({ success: true, user, message: 'Role წარმატებით შეიცვალა' });
  } catch (error) {
    console.error('ADMIN UPDATE ROLE ERROR:', error);
    res.status(500).json({ success: false, message: 'Role-ის შეცვლა ვერ მოხერხდა' });
  }
};

// PUT /api/admin/users/:userId/ban   body: { banned: true, reason?: string }
exports.setUserBanStatus = async (req, res) => {
  try {
    const { banned, reason } = req.body;

    if (req.params.userId === String(req.userId)) {
      return res.status(400).json({ success: false, message: 'საკუთარი თავის დაბლოკვა არ შეიძლება' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { isBanned: !!banned, bannedReason: banned ? (reason || '') : '' },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'მომხმარებელი ვერ მოიძებნა' });
    }

    res.json({
      success: true,
      user,
      message: banned ? 'მომხმარებელი დაიბლოკა' : 'მომხმარებელი განიბლოკა'
    });
  } catch (error) {
    console.error('ADMIN BAN USER ERROR:', error);
    res.status(500).json({ success: false, message: 'ოპერაცია ვერ შესრულდა' });
  }
};

// DELETE /api/admin/users/:userId  — user + მისი ყველა მონაცემი (cascade)
exports.deleteUser = async (req, res) => {
  try {
    if (req.params.userId === String(req.userId)) {
      return res.status(400).json({ success: false, message: 'საკუთარი ანგარიშის წაშლა არ შეიძლება' });
    }

    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'მომხმარებელი ვერ მოიძებნა' });
    }
    const userId = user._id;

    // 1) ამ user-ის განცხადებები, რომლებიც სხვის trip-ზეა მიღებული — trip-ს ვუბრუნებთ ადგილს
    const ownParcels = await Parcel.find({ senderId: userId, acceptedTrip: { $ne: null } });
    for (const p of ownParcels) {
      await DriverTrip.updateOne(
        { _id: p.acceptedTrip },
        { $pull: { acceptedShippings: p._id }, $inc: { availableSpace: p.weight || 0 } }
      );
    }

    // 2) ამ user-ის trip-ებზე მიღებული ნივთები ისევ pending ხდება
    const ownTrips = await DriverTrip.find({ driverId: userId }).select('acceptedShippings');
    const acceptedIds = ownTrips.flatMap((t) => t.acceptedShippings || []);
    if (acceptedIds.length) {
      await Parcel.updateMany(
        { _id: { $in: acceptedIds } },
        { $set: { status: 'pending', acceptedBy: null, acceptedTrip: null, acceptedAt: null } }
      );
    }

    // 3) თვითონ ჩანაწერების წაშლა
    await Promise.all([
      Parcel.deleteMany({ senderId: userId }),
      DriverTrip.deleteMany({ driverId: userId }),
      PickupOffer.deleteMany({ $or: [{ driverId: userId }, { senderId: userId }] }),
      TripPickupRequest.deleteMany({ $or: [{ driverId: userId }, { senderId: userId }] })
    ]);

    res.json({ success: true, message: 'მომხმარებელი და მისი მონაცემები წარმატებით წაიშალა' });
  } catch (error) {
    console.error('ADMIN DELETE USER ERROR:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'მომხმარებელი ვერ მოიძებნა' });
    }
    res.status(500).json({ success: false, message: 'მომხმარებლის წაშლა ვერ მოხერხდა' });
  }
};

/* ============================================================
   PARCEL REQUESTS MANAGEMENT (ownership-ის გარეშე — ყველა)
   ============================================================ */

// GET /api/admin/requests?status=pending&search=&page=1&limit=20
exports.getAllRequestsAdmin = async (req, res) => {
  try {
    const { status, search } = req.query;
    const { pageNum, limitNum, skip } = getPaging(req.query);

    const query = {};
    if (status && REQUEST_STATUSES.includes(status)) {
      query.status = status;
    }
    if (search && search.trim()) {
      const term = search.trim();
      const regex = new RegExp(escapeRegex(term), 'i');
      const senderIds = await matchUserIds(term);
      query.$or = [
        { from: regex },
        { to: regex },
        { senderPhone: regex },
        { recipientPhone: regex },
        { description: regex },
        { senderId: { $in: senderIds } }
      ];
    }

    const [requests, total] = await Promise.all([
      Parcel.find(query)
        .populate('senderId', 'firstName lastName email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Parcel.countDocuments(query)
    ]);

    res.json({
      success: true,
      requests: requests.map(shapeRequest),
      pagination: buildPagination(total, pageNum, limitNum)
    });
  } catch (error) {
    console.error('ADMIN GET ALL REQUESTS ERROR:', error);
    res.status(500).json({ success: false, message: 'განცხადებების ჩატვირთვა ვერ მოხერხდა' });
  }
};

// PUT /api/admin/requests/:requestId/status   body: { status }
exports.forceUpdateRequestStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!REQUEST_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'სტატუსი ვალიდური არ არის' });
    }

    const parcel = await Parcel.findById(req.params.requestId);
    if (!parcel) {
      return res.status(404).json({ success: false, message: 'განცხადება ვერ მოიძებნა' });
    }

    parcel.status = status;
    if (status === 'delivered') parcel.deliveredAt = new Date();
    await parcel.save();

    res.json({ success: true, data: parcel, message: 'სტატუსი წარმატებით განახლდა' });
  } catch (error) {
    console.error('ADMIN FORCE UPDATE STATUS ERROR:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'განცხადება ვერ მოიძებნა' });
    }
    res.status(500).json({ success: false, message: 'სტატუსის განახლება ვერ მოხერხდა' });
  }
};

// DELETE /api/admin/requests/:requestId
exports.forceDeleteRequest = async (req, res) => {
  try {
    const parcel = await Parcel.findById(req.params.requestId);
    if (!parcel) {
      return res.status(404).json({ success: false, message: 'განცხადება ვერ მოიძებნა' });
    }

    if (parcel.acceptedTrip) {
      const trip = await DriverTrip.findById(parcel.acceptedTrip);
      if (trip) {
        trip.acceptedShippings = trip.acceptedShippings.filter(
          (id) => id.toString() !== parcel._id.toString()
        );
        trip.availableSpace = (trip.availableSpace || 0) + (parcel.weight || 0);
        await trip.save();
      }
    }

    await Parcel.findByIdAndDelete(req.params.requestId);
    await PickupOffer.deleteMany({ parcelId: req.params.requestId });

    res.json({ success: true, message: 'განცხადება წარმატებით წაიშალა (admin)' });
  } catch (error) {
    console.error('ADMIN FORCE DELETE REQUEST ERROR:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'განცხადება ვერ მოიძებნა' });
    }
    res.status(500).json({ success: false, message: 'წაშლა ვერ მოხერხდა' });
  }
};

/* ============================================================
   DRIVER TRIPS MANAGEMENT (ownership-ის გარეშე — ყველა)
   ============================================================ */

// GET /api/admin/trips?status=active&search=&page=1&limit=20
exports.getAllTripsAdmin = async (req, res) => {
  try {
    const { status, search } = req.query;
    const { pageNum, limitNum, skip } = getPaging(req.query);

    const query = {};
    if (status && TRIP_STATUSES.includes(status)) {
      query.status = status;
    }
    if (search && search.trim()) {
      const term = search.trim();
      const regex = new RegExp(escapeRegex(term), 'i');
      const driverIds = await matchUserIds(term);
      query.$or = [
        { from: regex },
        { to: regex },
        { carPlate: regex },
        { carModel: regex },
        { driverId: { $in: driverIds } }
      ];
    }

    const [trips, total] = await Promise.all([
      DriverTrip.find(query)
        .populate('driverId', 'firstName lastName email phone')
        .populate('acceptedShippings')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      DriverTrip.countDocuments(query)
    ]);

    res.json({
      success: true,
      trips: trips.map(shapeTrip),
      pagination: buildPagination(total, pageNum, limitNum)
    });
  } catch (error) {
    console.error('ADMIN GET ALL TRIPS ERROR:', error);
    res.status(500).json({ success: false, message: 'მგზავრობების ჩატვირთვა ვერ მოხერხდა' });
  }
};

// PUT /api/admin/trips/:tripId/status   body: { status }
exports.forceUpdateTripStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!TRIP_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'სტატუსი ვალიდური არ არის' });
    }

    const trip = await DriverTrip.findById(req.params.tripId);
    if (!trip) {
      return res.status(404).json({ success: false, message: 'მგზავრობა ვერ მოიძებნა' });
    }

    trip.status = status;
    await trip.save();

    res.json({ success: true, data: trip, message: 'სტატუსი წარმატებით განახლდა' });
  } catch (error) {
    console.error('ADMIN FORCE UPDATE TRIP STATUS ERROR:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'მგზავრობა ვერ მოიძებნა' });
    }
    res.status(500).json({ success: false, message: 'სტატუსის განახლება ვერ მოხერხდა' });
  }
};

// PUT /api/admin/trips/:tripId/cancel
exports.forceCancelTrip = async (req, res) => {
  try {
    const trip = await DriverTrip.findById(req.params.tripId);
    if (!trip) {
      return res.status(404).json({ success: false, message: 'მგზავრობა ვერ მოიძებნა' });
    }

    trip.status = 'cancelled';
    await trip.save();

    res.json({ success: true, data: trip, message: 'მგზავრობა გაუქმდა (admin)' });
  } catch (error) {
    console.error('ADMIN FORCE CANCEL TRIP ERROR:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'მგზავრობა ვერ მოიძებნა' });
    }
    res.status(500).json({ success: false, message: 'გაუქმება ვერ მოხერხდა' });
  }
};

// DELETE /api/admin/trips/:tripId
exports.forceDeleteTrip = async (req, res) => {
  try {
    const trip = await DriverTrip.findById(req.params.tripId);
    if (!trip) {
      return res.status(404).json({ success: false, message: 'მგზავრობა ვერ მოიძებნა' });
    }

    if (trip.acceptedShippings && trip.acceptedShippings.length > 0) {
      await Parcel.updateMany(
        { _id: { $in: trip.acceptedShippings } },
        { $set: { status: 'pending', acceptedBy: null, acceptedTrip: null, acceptedAt: null } }
      );
    }

    await DriverTrip.findByIdAndDelete(req.params.tripId);
    await TripPickupRequest.deleteMany({ tripId: req.params.tripId });

    res.json({ success: true, message: 'მგზავრობა წარმატებით წაიშალა (admin)' });
  } catch (error) {
    console.error('ADMIN FORCE DELETE TRIP ERROR:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'მგზავრობა ვერ მოიძებნა' });
    }
    res.status(500).json({ success: false, message: 'წაშლა ვერ მოხერხდა' });
  }
};

/* ============================================================
   PICKUP OFFERS (მძღოლის შეთავაზება კონკრეტულ ნივთზე)
   ============================================================ */

// GET /api/admin/offers?status=pending&page=1&limit=20
exports.getAllOffersAdmin = async (req, res) => {
  try {
    const { status } = req.query;
    const { pageNum, limitNum, skip } = getPaging(req.query);

    const query = {};
    if (status && status !== 'all') query.status = status;

    const [offers, total] = await Promise.all([
      PickupOffer.find(query)
        .populate('parcelId', 'from to weight value status')
        .populate('driverId', PERSON_FIELDS)
        .populate('senderId', PERSON_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      PickupOffer.countDocuments(query)
    ]);

    res.json({ success: true, offers, pagination: buildPagination(total, pageNum, limitNum) });
  } catch (error) {
    console.error('ADMIN GET OFFERS ERROR:', error);
    res.status(500).json({ success: false, message: 'შეთავაზებების ჩატვირთვა ვერ მოხერხდა' });
  }
};

// DELETE /api/admin/offers/:offerId
exports.forceDeleteOffer = async (req, res) => {
  try {
    const offer = await PickupOffer.findByIdAndDelete(req.params.offerId);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'შეთავაზება ვერ მოიძებნა' });
    }
    res.json({ success: true, message: 'შეთავაზება წაიშალა (admin)' });
  } catch (error) {
    console.error('ADMIN DELETE OFFER ERROR:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'შეთავაზება ვერ მოიძებნა' });
    }
    res.status(500).json({ success: false, message: 'წაშლა ვერ მოხერხდა' });
  }
};

/* ============================================================
   TRIP PICKUP REQUESTS (გამგზავნის მოთხოვნა კონკრეტულ მგზავრობაზე)
   ============================================================ */

// GET /api/admin/trip-requests?status=pending&page=1&limit=20
exports.getAllTripRequestsAdmin = async (req, res) => {
  try {
    const { status } = req.query;
    const { pageNum, limitNum, skip } = getPaging(req.query);

    const query = {};
    if (status && status !== 'all') query.status = status;

    const [tripRequests, total] = await Promise.all([
      TripPickupRequest.find(query)
        .populate('tripId', 'from to departureDate status')
        .populate('driverId', PERSON_FIELDS)
        .populate('senderId', PERSON_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      TripPickupRequest.countDocuments(query)
    ]);

    res.json({ success: true, tripRequests, pagination: buildPagination(total, pageNum, limitNum) });
  } catch (error) {
    console.error('ADMIN GET TRIP REQUESTS ERROR:', error);
    res.status(500).json({ success: false, message: 'მოთხოვნების ჩატვირთვა ვერ მოხერხდა' });
  }
};

// DELETE /api/admin/trip-requests/:requestId
exports.forceDeleteTripRequest = async (req, res) => {
  try {
    const doc = await TripPickupRequest.findByIdAndDelete(req.params.requestId);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'მოთხოვნა ვერ მოიძებნა' });
    }
    res.json({ success: true, message: 'მოთხოვნა წაიშალა (admin)' });
  } catch (error) {
    console.error('ADMIN DELETE TRIP REQUEST ERROR:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'მოთხოვნა ვერ მოიძებნა' });
    }
    res.status(500).json({ success: false, message: 'წაშლა ვერ მოხერხდა' });
  }
};

module.exports = exports;