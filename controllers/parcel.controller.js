const { Parcel, DriverTrip } = require('../models');

// ============================================
// PUBLIC - ბოლო განცხადებები (Home Page)
// ============================================

exports.getRecentRequests = async (req, res) => {
  try {
    const requests = await Parcel.find()
      .populate('senderId', 'firstName lastName email')
      .select('_id from to weight value status createdAt senderId')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    const requestsWithNames = requests.map(r => ({
      ...r,
      senderName: r.senderId
        ? `${r.senderId.firstName} ${r.senderId.lastName}`
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
      .populate('driverId', 'firstName lastName email')
      .populate('acceptedShippings')
      .select('_id driverId from to departureDate availableSpace pricePerKg status acceptedShippings createdAt')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

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
      data: parcel,
      message: 'განცხადება წარმატებით დაიდო!'
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
        message: 'არ ხართ ავტორიზებული'
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
// PUBLIC/SENDER - ერთი კონკრეტული განცხადების ნახვა (ID-ით)
// ============================================

exports.getParcelRequestById = async (req, res) => {
  try {
    const { requestId } = req.params;

    const parcel = await Parcel.findById(requestId)
      .populate('senderId', 'firstName lastName')
      .lean();

    if (!parcel) {
      return res.status(404).json({
        success: false,
        message: 'განცხადება ვერ მოიძებნა'
      });
    }

    const data = {
      ...parcel,
      senderName: parcel.senderId
        ? `${parcel.senderId.firstName} ${parcel.senderId.lastName}`
        : parcel.senderName || 'უცნობი გამგზავნი'
    };

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching parcel request by id:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'განცხადება ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'განცხადების ჩატვირთვა ვერ მოხერხდა'
    });
  }
};

// ============================================
// SENDER - სტატუსის განახლება (მხოლოდ sender-მა)
// ============================================

exports.updateParcelStatus = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['pending', 'accepted', 'in-transit', 'delivered', 'cancelled'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'სტატუსი ვალიდური არ არის'
      });
    }

    const parcel = await Parcel.findById(requestId);
    if (!parcel) {
      return res.status(404).json({
        success: false,
        message: 'განცხადება ვერ მოიძებნა'
      });
    }

    if (parcel.senderId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'თქვენ არ გაქვთ ამ განცხადების რედაქტირების უფლება'
      });
    }

    parcel.status = status;
    if (status === 'delivered') {
      parcel.deliveredAt = new Date();
    }
    await parcel.save();

    res.json({
      success: true,
      data: parcel,
      message: 'სტატუსი წარმატებით განახლდა'
    });
  } catch (error) {
    console.error('Error updating parcel status:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'განცხადება ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'სტატუსის განახლება ვერ მოხერხდა'
    });
  }
};

// ============================================
// SENDER - განცხადების ხელახლა გამოქვეყნება
// ============================================

exports.republishRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const parcel = await Parcel.findById(requestId);
    if (!parcel) {
      return res.status(404).json({
        success: false,
        message: 'განცხადება ვერ მოიძებნა'
      });
    }

    if (parcel.senderId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'თქვენ არ გაქვთ ამ განცხადების რედაქტირების უფლება'
      });
    }

    parcel.status = 'pending';
    parcel.acceptedBy = null;
    parcel.acceptedTrip = null;
    parcel.acceptedAt = null;
    parcel.createdAt = new Date();
    await parcel.save();

    res.json({
      success: true,
      data: parcel,
      message: 'განცხადება წარმატებით გამოქვეყნდა'
    });
  } catch (error) {
    console.error('Error republishing request:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'განცხადება ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'ხელახლა გამოქვეყნება ვერ მოხერხდა'
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
      data: trip,
      message: 'მგზავრობა წარმატებით განთავსდა!'
    });
  } catch (error) {
    console.error('Error creating trip:', error);
    res.status(500).json({
      success: false,
      message: 'მგზავრობა ვერ განთავსდა'
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
        message: 'არ ხართ ავტორიზებული'
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
// DRIVER - კონკრეტული ტრიპის ნახვა (მხოლოდ მისი)
// ============================================

exports.getTrip = async (req, res) => {
  try {
    const { tripId } = req.params;

    const trip = await DriverTrip.findById(tripId)
      .populate('acceptedShippings')
      .populate('driverId', 'firstName lastName')
      .lean();

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: 'მგზავრობა ვერ მოიძებნა'
      });
    }

    if (trip.driverId && trip.driverId._id.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'თქვენ არ გაქვთ ამ მგზავრობის ნახვის უფლება'
      });
    }

    const data = {
      ...trip,
      driverName: trip.driverId
        ? `${trip.driverId.firstName} ${trip.driverId.lastName}`
        : 'უცნობი მძღოლი'
    };

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching trip:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'მგზავრობა ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'მგზავრობის ჩატვირთვა ვერ მოხერხდა'
    });
  }
};

// ============================================
// PUBLIC - კონკრეტული ტრიპის ნახვა (ID-ით, ავტორიზაციის გარეშე)
// ============================================
// ✅ ეს ახალი ფუნქციაა - home page-იდან "მგზავრობის ნახვა" ღილაკისთვის

exports.getTripDetailsPublic = async (req, res) => {
  try {
    const { tripId } = req.params;

    const trip = await DriverTrip.findById(tripId)
      .populate('acceptedShippings')
      .populate('driverId', 'firstName lastName')
      .lean();

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: 'მგზავრობა ვერ მოიძებნა'
      });
    }

    const data = {
      ...trip,
      driverName: trip.driverId
        ? `${trip.driverId.firstName} ${trip.driverId.lastName}`
        : 'უცნობი მძღოლი'
    };

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching public trip details:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'მგზავრობა ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'მგზავრობის ჩატვირთვა ვერ მოხერხდა'
    });
  }
};

// ============================================
// DRIVER - ტრიპის განახლება
// ============================================

exports.updateTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const updates = req.body || {};

    const trip = await DriverTrip.findById(tripId);
    if (!trip) {
      return res.status(404).json({
        success: false,
        message: 'მგზავრობა ვერ მოიძებნა'
      });
    }

    if (trip.driverId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'თქვენ არ გაქვთ ამ მგზავრობის რედაქტირების უფლება'
      });
    }

    // ✅ დაცული ველები, რომლების პირდაპირ overwrite არ შეიძლება
    delete updates.driverId;
    delete updates._id;
    delete updates.acceptedShippings;
    delete updates.createdAt;

    Object.assign(trip, updates);
    await trip.save();

    res.json({
      success: true,
      data: trip,
      message: 'მგზავრობა წარმატებით განახლდა'
    });
  } catch (error) {
    console.error('Error updating trip:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'მგზავრობა ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'მგზავრობის განახლება ვერ მოხერხდა'
    });
  }
};

// ============================================
// DRIVER - ტრიპის გაუქმება
// ============================================

exports.cancelTrip = async (req, res) => {
  try {
    const { tripId } = req.params;

    const trip = await DriverTrip.findById(tripId);
    if (!trip) {
      return res.status(404).json({
        success: false,
        message: 'მგზავრობა ვერ მოიძებნა'
      });
    }

    if (trip.driverId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'თქვენ არ გაქვთ ამ მგზავრობის გაუქმების უფლება'
      });
    }

    trip.status = 'cancelled';
    await trip.save();

    res.json({
      success: true,
      data: trip,
      message: 'მგზავრობა გაუქმდა'
    });
  } catch (error) {
    console.error('Error cancelling trip:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'მგზავრობა ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'მგზავრობის გაუქმება ვერ მოხერხდა'
    });
  }
};

// ============================================
// DRIVER - ტრიპის დასრულება
// ============================================

exports.completeTrip = async (req, res) => {
  try {
    const { tripId } = req.params;

    const trip = await DriverTrip.findById(tripId);
    if (!trip) {
      return res.status(404).json({
        success: false,
        message: 'მგზავრობა ვერ მოიძებნა'
      });
    }

    if (trip.driverId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'თქვენ არ გაქვთ ამ მგზავრობის დასრულების უფლება'
      });
    }

    trip.status = 'completed';
    trip.completedAt = new Date();
    await trip.save();

    res.json({
      success: true,
      data: trip,
      message: 'მგზავრობა დასრულდა'
    });
  } catch (error) {
    console.error('Error completing trip:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'მგზავრობა ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'მგზავრობის დასრულება ვერ მოხერხდა'
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
        message: 'არ ხართ ავტორიზებული'
      });
    }

    const completedTrips = await DriverTrip.countDocuments({
      driverId,
      status: 'completed'
    });

    const allTrips = await DriverTrip.find({ driverId }).populate('acceptedShippings');

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

    const activeTripDoc = allTrips.find(t => t.status === 'active');

    const stats = {
      completedTrips: completedTrips || 0,
      averageRating: 4.8,
      reviewCount: Math.floor(Math.random() * 100),
      currentEarnings: parseFloat(currentEarnings.toFixed(2)),
      earningsTrend: '📈 12%',
      hasActiveTrip: !!activeTripDoc,
      activeTrip: activeTripDoc
        ? {
            from: activeTripDoc.from,
            to: activeTripDoc.to,
            distance: 0,
            estimatedTime: 0
          }
        : undefined
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
// DRIVER - შემოსავლის ანგარიში
// ============================================

exports.getEarningsReport = async (req, res) => {
  try {
    const driverId = req.userId;
    const { period } = req.query; // 'week' | 'month' | 'all'

    const now = new Date();
    let fromDate = null;

    if (period === 'week') {
      fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      fromDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }

    const query = { driverId, status: 'completed' };
    if (fromDate) {
      query.completedAt = { $gte: fromDate };
    }

    const trips = await DriverTrip.find(query).populate('acceptedShippings').lean();

    let totalEarnings = 0;
    const breakdown = trips.map(trip => {
      let tripEarnings = 0;
      (trip.acceptedShippings || []).forEach(shipping => {
        tripEarnings += (shipping.weight || 0) * (trip.pricePerKg || 0);
      });
      totalEarnings += tripEarnings;
      return {
        tripId: trip._id,
        from: trip.from,
        to: trip.to,
        completedAt: trip.completedAt,
        earnings: parseFloat(tripEarnings.toFixed(2))
      };
    });

    res.json({
      success: true,
      data: {
        period: period || 'all',
        totalEarnings: parseFloat(totalEarnings.toFixed(2)),
        trips: breakdown
      }
    });
  } catch (error) {
    console.error('Error fetching earnings report:', error);
    res.status(500).json({
      success: false,
      message: 'შემოსავლის ანგარიშის ჩატვირთვა ვერ მოხერხდა'
    });
  }
};

// ============================================
// DRIVER - შეფასებების ნახვა
// ============================================

exports.getDriverReviews = async (req, res) => {
  try {
    // ⚠️ შენიშვნა: რეალური Review მოდელი ჯერ არ არსებობს models/index.js-ში.
    // როცა შექმნით (მაგ. Review სქემა driverId, rating, comment ველებით),
    // ჩაანაცვლეთ ეს placeholder რეალური query-თი:
    // const reviews = await Review.find({ driverId: req.userId }).lean();

    res.json({
      success: true,
      data: []
    });
  } catch (error) {
    console.error('Error fetching driver reviews:', error);
    res.status(500).json({
      success: false,
      message: 'შეფასებების ჩატვირთვა ვერ მოხერხდა'
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
      message: 'გაგზავნების ჩატვირთვა ვერ მოხერხდა'
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
        message: 'ეს გაგზავნა უკვე მიღებულია სხვის მიერ'
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
      parcel.acceptedTrip = activeTrip._id;
      await parcel.save();

      activeTrip.acceptedShippings.push(parcel._id);
      activeTrip.availableSpace -= parcel.weight;
      await activeTrip.save();
    }

    res.status(200).json({
      success: true,
      shippingId: parcel._id,
      data: parcel,
      message: 'გაგზავნა წარმატებით მიღებულია!'
    });
  } catch (error) {
    console.error('Error accepting shipping:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'გაგზავნა ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'გაგზავნის მიღება ვერ მოხერხდა'
    });
  }
};

// ============================================
// DRIVER - გაგზავნის უარყოფა
// ============================================

exports.rejectShipping = async (req, res) => {
  try {
    const { shippingId } = req.params;
    const { reason } = req.body || {};

    const parcel = await Parcel.findById(shippingId);
    if (!parcel) {
      return res.status(404).json({
        success: false,
        message: 'გაგზავნა ვერ მოიძებნა'
      });
    }

    // უარყოფა უბრალოდ ტოვებს status-ს pending-ზე, რომ სხვა მძღოლმა ნახოს.
    // (გსურთ, შეგიძლიათ დაამატოთ "rejectedBy" სია დუბლირებული შეთავაზების თავიდან ასაცილებლად)
    if (reason) {
      parcel.notes = `${parcel.notes || ''}\n[უარყოფილია: ${reason}]`.trim();
      await parcel.save();
    }

    res.status(200).json({
      success: true,
      message: 'გაგზავნა უარყოფილია'
    });
  } catch (error) {
    console.error('Error rejecting shipping:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'გაგზავნა ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'გაგზავნის უარყოფა ვერ მოხერხდა'
    });
  }
};

// ============================================
// DRIVER - გაგზავნის აღება (in-transit)
// ============================================

exports.pickupShipping = async (req, res) => {
  try {
    const { shippingId } = req.params;

    const parcel = await Parcel.findById(shippingId);
    if (!parcel) {
      return res.status(404).json({
        success: false,
        message: 'გაგზავნა ვერ მოიძებნა'
      });
    }

    if (parcel.acceptedBy?.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'თქვენ არ გაქვთ ამ გაგზავნის განახლების უფლება'
      });
    }

    if (parcel.status !== 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'გაგზავნის სტატუსი არ იძლევა ამის საშუალებას'
      });
    }

    parcel.status = 'in-transit';
    await parcel.save();

    res.status(200).json({
      success: true,
      data: parcel,
      message: 'გაგზავნა გზაშია'
    });
  } catch (error) {
    console.error('Error picking up shipping:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'გაგზავნა ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'გაგზავნის სტატუსის განახლება ვერ მოხერხდა'
    });
  }
};

// ============================================
// DRIVER - გაგზავნის ჩაბარება (delivered)
// ============================================

exports.deliverShipping = async (req, res) => {
  try {
    const { shippingId } = req.params;

    const parcel = await Parcel.findById(shippingId);
    if (!parcel) {
      return res.status(404).json({
        success: false,
        message: 'გაგზავნა ვერ მოიძებნა'
      });
    }

    if (parcel.acceptedBy?.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'თქვენ არ გაქვთ ამ გაგზავნის განახლების უფლება'
      });
    }

    if (parcel.status !== 'in-transit') {
      return res.status(400).json({
        success: false,
        message: 'გაგზავნის სტატუსი არ იძლევა ამის საშუალებას'
      });
    }

    parcel.status = 'delivered';
    parcel.deliveredAt = new Date();
    await parcel.save();

    res.status(200).json({
      success: true,
      data: parcel,
      message: 'გაგზავნა ჩაბარებულია'
    });
  } catch (error) {
    console.error('Error delivering shipping:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'გაგზავნა ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'გაგზავნის სტატუსის განახლება ვერ მოხერხდა'
    });
  }
};

module.exports = exports;
