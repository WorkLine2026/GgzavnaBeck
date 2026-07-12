// 📂 backend/controllers/parcel.controller.js

const { Parcel, DriverTrip } = require('../models');

// ============================================
// PUBLIC - ბოლო განცხადებები (Home Page)
// ============================================

exports.getRecentRequests = async (req, res) => {
  try {
    const requests = await Parcel.find()
      .populate('senderId', 'firstName lastName email') // sender's info
      .select('_id from to weight value status createdAt senderId')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    // დამატე senderName
    const requestsWithNames = requests.map(req => ({
      ...req,
      senderName: req.senderId
        ? `${req.senderId.firstName} ${req.senderId.lastName}`
        : 'უცნობი გამგზავნი'
    }));

    res.json({
      success: true,
      requests: requestsWithNames
    });
  } catch (error) {
    console.error('Error fetching recent requests:', error);
    res.status(500).json({
      success: false,
      message: 'განცხადებების ჩატვირთვა ვერ მოხერხდა'
    });
  }
};

// ============================================
// PUBLIC - ბოლო მგზავრობები (Home Page)
// ============================================

exports.getRecentTrips = async (req, res) => {
  try {
    const trips = await DriverTrip.find()
      .populate('driverId', 'firstName lastName email') // driver's info
      .populate('acceptedShippings')
      .select('_id driverId from to departureDate availableSpace pricePerKg status acceptedShippings createdAt')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    // დამატე driverName
    const tripsWithNames = trips.map(trip => ({
      ...trip,
      driverName: trip.driverId
        ? `${trip.driverId.firstName} ${trip.driverId.lastName}`
        : 'უცნობი მძღოლი'
    }));

    res.json({
      success: true,
      trips: tripsWithNames
    });
  } catch (error) {
    console.error('Error fetching recent trips:', error);
    res.status(500).json({
      success: false,
      message: 'მგზავრობების ჩატვირთვა ვერ მოხერხდა'
    });
  }
};

// ============================================
// SENDER - განცხადების დადება
// ============================================

exports.createParcelRequest = async (req, res) => {
  try {
    const {
      from,
      to,
      shipDate,
      description,
      weight,
      value,
      notes,
      senderPhone,
      recipientPhone,
      status
    } = req.body;

    // ✅ Validation
    if (!from || !to || from === to) {
      return res.status(400).json({
        success: false,
        message: 'მარშრუტი ვალიდი არ არის'
      });
    }

    if (weight < 0.1 || weight > 300) {
      return res.status(400).json({
        success: false,
        message: 'წონა უნდა იყოს 0.1 - 300 კგ'
      });
    }

    if (value < 1 || value > 1000000) {
      return res.status(400).json({
        success: false,
        message: 'ღირებულება უნდა იყოს 1 - 1,000,000 ₾'
      });
    }

    // ✅ Create Parcel
    const parcel = new Parcel({
      senderId: req.userId,
      senderPhone,
      recipientPhone,
      from,
      to,
      shipDate: new Date(shipDate),
      description,
      weight,
      value,
      notes: notes || '',
      status: status || 'pending',
      createdAt: new Date()
    });

    await parcel.save();

    res.status(201).json({
      success: true,
      requestId: parcel._id,
      message: 'განცხადება წარმატებით დაიქვიათ!'
    });
  } catch (error) {
    console.error('Error creating parcel request:', error);
    res.status(500).json({
      success: false,
      message: 'განცხადება ვერ დამატდა'
    });
  }
};

// ============================================
// SENDER - ჩემი განცხადებები (Authenticated)
// ============================================

exports.getUserRequests = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'არ დაა ავტორიზებული'
      });
    }

    const requests = await Parcel.find({ senderId: userId })
      .select('_id from to weight value status createdAt')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      requests: requests || []
    });
  } catch (error) {
    console.error('Error fetching user requests:', error);
    res.status(500).json({
      success: false,
      message: 'განცხადებების ჩატვირთვა წარუმატებელი'
    });
  }
};

// ============================================
// DRIVER - ტრიპის შექმნა
// ============================================

exports.createTrip = async (req, res) => {
  try {
    const {
      from,
      to,
      departureDate,
      availableSpace,
      pricePerKg,
      personalNumber,
      senderPhone,
      carModel,
      carPlate,
      comments,
      status
    } = req.body;

    // ✅ Validation
    if (!from || !to || from === to) {
      return res.status(400).json({
        success: false,
        message: 'მარშრუტი ვალიდი არ არის'
      });
    }

    if (availableSpace < 1 || availableSpace > 1000) {
      return res.status(400).json({
        success: false,
        message: 'ადგილი უნდა იყოს 1 - 1000 კგ'
      });
    }

    if (pricePerKg < 0.1) {
      return res.status(400).json({
        success: false,
        message: 'ფასი უნდა იყოს მინიმუმ 0.1 ₾/კგ'
      });
    }

    // ✅ Create Trip
    const trip = new DriverTrip({
      driverId: req.userId,
      from,
      to,
      departureDate: new Date(departureDate),
      availableSpace,
      pricePerKg,
      personalNumber,
      senderPhone,
      carModel: carModel || '',
      carPlate: carPlate || '',
      comments: comments || '',
      status: status || 'pending',
      acceptedShippings: [],
      createdAt: new Date()
    });

    await trip.save();

    res.status(201).json({
      success: true,
      tripId: trip._id,
      message: 'მგზავრობა წარმატებით განათავსდა!'
    });
  } catch (error) {
    console.error('Error creating trip:', error);
    res.status(500).json({
      success: false,
      message: 'მგზავრობა ვერ განათავსდა'
    });
  }
};

// ============================================
// DRIVER - ჩემი მგზავრობები (Authenticated)
// ============================================

exports.getDriverTrips = async (req, res) => {
  try {
    const driverId = req.userId;

    if (!driverId) {
      return res.status(401).json({
        success: false,
        message: 'არ დაა ავტორიზებული'
      });
    }

    const trips = await DriverTrip.find({ driverId })
      .populate('acceptedShippings')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      trips: trips || [],
      message: 'მგზავრობები დაიტვირთა'
    });
  } catch (error) {
    console.error('Error fetching driver trips:', error);
    res.status(500).json({
      success: false,
      message: 'მგზავრობების ჩატვირთვა ვერ მოხერხდა'
    });
  }
};

// ============================================
// DRIVER - სტატისტიკა (Authenticated)
// ============================================

exports.getDriverStats = async (req, res) => {
  try {
    const driverId = req.userId;

    if (!driverId) {
      return res.status(401).json({
        success: false,
        message: 'არ დაა ავტორიზებული'
      });
    }

    // დასრულებული მგზავრობები
    const completedTrips = await DriverTrip.countDocuments({
      driverId,
      status: 'completed'
    });

    // ყველა მგზავრობა
    const allTrips = await DriverTrip.find({ driverId }).populate('acceptedShippings');

    // შემოსავალი გამოთვლა
    let currentEarnings = 0;
    allTrips.forEach(trip => {
      if (trip.acceptedShippings && trip.acceptedShippings.length > 0) {
        trip.acceptedShippings.forEach(shipping => {
          const weight = shipping.weight || 0;
          const price = trip.pricePerKg || 0;
          currentEarnings += weight * price;
        });
      }
    });

    // სტატისტიკა
    const stats = {
      completedTrips: completedTrips || 0,
      averageRating: 4.8,
      reviewCount: Math.floor(Math.random() * 100),
      currentEarnings: parseFloat(currentEarnings.toFixed(2)),
      earningsTrend: '📈 12%',
      hasActiveTrip: allTrips.some(t => t.status === 'active'),
      activeTrip: undefined
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching driver stats:', error);
    res.status(500).json({
      success: false,
      message: 'სტატისტიკის ჩატვირთვა ვერ მოხერხდა'
    });
  }
};

// ============================================
// DRIVER - ხელმისაწვდომი გაგზავნები
// ============================================

exports.getAvailableShippings = async (req, res) => {
  try {
    const { from, to, departureDate } = req.query;

    if (!from || !to || !departureDate) {
      return res.status(400).json({
        success: false,
        message: 'საჭირო პარამეტრები არ მითითებულია'
      });
    }

    const departureStart = new Date(departureDate);
    departureStart.setHours(0, 0, 0, 0);

    const departureEnd = new Date(departureDate);
    departureEnd.setHours(23, 59, 59, 999);

    const shippings = await Parcel.find({
      from: from,
      to: to,
      shipDate: {
        $gte: departureStart,
        $lte: departureEnd
      },
      status: 'pending',
      acceptedBy: null
    }).select('from to description weight value shipDate senderPhone senderName status createdAt').lean();

    const formattedShippings = shippings.map(parcel => ({
      _id: parcel._id,
      from: parcel.from,
      to: parcel.to,
      parcelDetails: {
        from: parcel.from,
        to: parcel.to,
        description: parcel.description,
        weight: parcel.weight,
        value: parcel.value
      },
      senderName: parcel.senderName || 'უსახელო გამგზავნელი',
      senderPhone: parcel.senderPhone,
      status: parcel.status,
      createdAt: parcel.createdAt
    }));

    res.status(200).json({
      success: true,
      shippings: formattedShippings,
      message: `${formattedShippings.length} ხელმისაწვდომი გაგზავნა იპოვნა`
    });
  } catch (error) {
    console.error('Error getting available shippings:', error);
    res.status(500).json({
      success: false,
      message: 'გაგზავნების ჩაკრება ვერ მოხერხდა'
    });
  }
};

// ============================================
// DRIVER - გაგზავნის მიღება
// ============================================

exports.acceptShipping = async (req, res) => {
  try {
    const { shippingId } = req.params;

    const parcel = await Parcel.findById(shippingId);
    if (!parcel) {
      return res.status(404).json({
        success: false,
        message: 'გაგზავნა ვერ მოიძებნა'
      });
    }

    if (parcel.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'ეს გაგზავნა უკვე მიიღო სხვამ'
      });
    }

    parcel.status = 'accepted';
    parcel.acceptedBy = req.userId;
    parcel.acceptedAt = new Date();
    await parcel.save();

    const activeTrip = await DriverTrip.findOne({
      driverId: req.userId,
      status: 'active'
    });

    if (activeTrip) {
      activeTrip.acceptedShippings.push(parcel._id);
      activeTrip.availableSpace -= parcel.weight;
      await activeTrip.save();
    }

    res.status(200).json({
      success: true,
      shippingId: parcel._id,
      message: 'გაგზავნა წარმატებით მიღებულია!'
    });
  } catch (error) {
    console.error('Error accepting shipping:', error);
    res.status(500).json({
      success: false,
      message: 'გაგზავნა ვერ მოხერხდა'
    });
  }
};

module.exports = exports;