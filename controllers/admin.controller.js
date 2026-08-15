const User = require('../models/User');
const { Parcel, DriverTrip } = require('../models');

/* ============================================================
   DASHBOARD STATS
   ============================================================ */

exports.getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalSenders,
      totalDrivers,
      totalRequests,
      pendingRequests,
      totalTrips,
      activeTrips
    ] = await Promise.all([
      User.countDocuments({ role: { $ne: 'admin' } }),
      User.countDocuments({ role: 'sender' }),
      User.countDocuments({ role: 'driver' }),
      Parcel.countDocuments(),
      Parcel.countDocuments({ status: 'pending' }),
      DriverTrip.countDocuments(),
      DriverTrip.countDocuments({ status: 'active' })
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalSenders,
        totalDrivers,
        totalRequests,
        pendingRequests,
        totalTrips,
        activeTrips
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
    const { role, search, page = 1, limit = 20 } = req.query;

    const query = {};
    if (role && ['sender', 'driver', 'admin'].includes(role)) {
      query.role = role;
    }
    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { phone: regex },
        { personalNumber: regex }
      ];
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      User.countDocuments(query)
    ]);

    res.json({
      success: true,
      users,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('ADMIN GET USERS ERROR:', error);
    res.status(500).json({ success: false, message: 'მომხმარებლების ჩატვირთვა ვერ მოხერხდა' });
  }
};

// GET /api/admin/users/:userId
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'მომხმარებელი ვერ მოიძებნა' });
    }

    // დამატებით — ამ user-ის request-ები და trip-ები (მოკლედ)
    const [requestsCount, tripsCount] = await Promise.all([
      Parcel.countDocuments({ senderId: user._id }),
      DriverTrip.countDocuments({ driverId: user._id })
    ]);

    res.json({
      success: true,
      user: { ...user, requestsCount, tripsCount }
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

    // ადმინმა საკუთარ თავს role არ უნდა ჩამოართვას შემთხვევით
    if (req.params.userId === req.userId && role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'საკუთარი admin role-ის ჩამოცილება საკუთარი ანგარიშიდან არ შეიძლება'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { role },
      { new: true }
    ).select('-password');

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

    if (req.params.userId === req.userId) {
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

// DELETE /api/admin/users/:userId
exports.deleteUser = async (req, res) => {
  try {
    if (req.params.userId === req.userId) {
      return res.status(400).json({ success: false, message: 'საკუთარი ანგარიშის წაშლა არ შეიძლება' });
    }

    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'მომხმარებელი ვერ მოიძებნა' });
    }

    // ⚠️ შენიშვნა: ეს არ შლის ავტომატურად user-ის request/trip ჩანაწერებს.
    // საჭიროებისამებრ შეგიძლიათ აქ დაამატოთ:
    // await Parcel.deleteMany({ senderId: user._id });
    // await DriverTrip.deleteMany({ driverId: user._id });

    res.json({ success: true, message: 'მომხმარებელი წარმატებით წაიშალა' });
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
    const { status, search, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status && ['pending', 'accepted', 'in-transit', 'delivered', 'cancelled'].includes(status)) {
      query.status = status;
    }
    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [{ from: regex }, { to: regex }, { senderPhone: regex }];
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const [requests, total] = await Promise.all([
      Parcel.find(query)
        .populate('senderId', 'firstName lastName email phone')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Parcel.countDocuments(query)
    ]);

    const requestsWithNames = requests.map(r => ({
      ...r,
      senderName: r.senderId
        ? `${r.senderId.firstName} ${r.senderId.lastName}`
        : 'უცნობი გამგზავნი'
    }));

    res.json({
      success: true,
      requests: requestsWithNames,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('ADMIN GET ALL REQUESTS ERROR:', error);
    res.status(500).json({ success: false, message: 'განცხადებების ჩატვირთვა ვერ მოხერხდა' });
  }
};

// PUT /api/admin/requests/:requestId/status   body: { status }
// ✅ ownership-შემოწმების გარეშე — admin-ს ნებისმიერის სტატუსის შეცვლა შეუძლია
exports.forceUpdateRequestStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'accepted', 'in-transit', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) {
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
// ✅ ownership-შემოწმების გარეშე — admin-ს ნებისმიერის წაშლა შეუძლია
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
          id => id.toString() !== parcel._id.toString()
        );
        trip.availableSpace = (trip.availableSpace || 0) + (parcel.weight || 0);
        await trip.save();
      }
    }

    await Parcel.findByIdAndDelete(req.params.requestId);

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
    const { status, search, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status && ['pending', 'active', 'in-progress', 'completed', 'cancelled'].includes(status)) {
      query.status = status;
    }
    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [{ from: regex }, { to: regex }, { carPlate: regex }];
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const [trips, total] = await Promise.all([
      DriverTrip.find(query)
        .populate('driverId', 'firstName lastName email phone')
        .populate('acceptedShippings')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      DriverTrip.countDocuments(query)
    ]);

    const tripsWithNames = trips.map(trip => ({
      ...trip,
      driverName: trip.driverId
        ? `${trip.driverId.firstName} ${trip.driverId.lastName}`
        : 'უცნობი მძღოლი'
    }));

    res.json({
      success: true,
      trips: tripsWithNames,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('ADMIN GET ALL TRIPS ERROR:', error);
    res.status(500).json({ success: false, message: 'მგზავრობების ჩატვირთვა ვერ მოხერხდა' });
  }
};

// PUT /api/admin/trips/:tripId/cancel
// ✅ ownership-შემოწმების გარეშე
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
// ✅ ownership-შემოწმების გარეშე
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

    res.json({ success: true, message: 'მგზავრობა წარმატებით წაიშალა (admin)' });
  } catch (error) {
    console.error('ADMIN FORCE DELETE TRIP ERROR:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'მგზავრობა ვერ მოიძებნა' });
    }
    res.status(500).json({ success: false, message: 'წაშლა ვერ მოხერხდა' });
  }
};

module.exports = exports;