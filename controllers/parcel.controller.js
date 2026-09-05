const { Parcel, DriverTrip, PickupOffer,TripPickupRequest } = require('../models');
const { uploadManyToCloudinary } = require('../utils/uploadToCloudinary');

// ============================================
// UTIL - realtime შეტყობინების გაგზავნა კონკრეტულ user-ზე
// ============================================
// ✅ NEW: server.js-ში io.on('connection') ატარებს socket-ს
// 'user:<id>' ოთახში, ასე რომ აქედან უბრალოდ იმ ოთახზე ვგზავნით.

function notifyUser(req, userId, payload) {
  try {
    const io = req.app.get('io');
    if (io && userId) {
      io.to(`user:${userId}`).emit('notification', payload);
    }
  } catch (e) {
    console.error('❌ notifyUser შეცდომა:', e);
  }
}

// ============================================
// PUBLIC - ბოლო განცხადებები (Home Page)
// ============================================

exports.getRecentRequests = async (req, res) => {
  try {
    const requests = await Parcel.find()
      .populate('senderId', 'firstName lastName email')
      .select('_id from to weight value status createdAt senderId images')
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
      .select('_id driverId from to departureDate availableSpace pricePerKg status acceptedShippings createdAt images')
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

    // ✅ ატვირთული ფოტოები Cloudinary-ზე იტვირთება (memory buffer-იდან)
    // და მუდმივი https URL-ები ბრუნდება, რომლებიც Mongo-ში ინახება
    let imageUrls = [];
    try {
      imageUrls = await uploadManyToCloudinary(req.files, 'ggzavna/parcels');
    } catch (uploadError) {
      console.error('❌ Cloudinary upload error (parcel):', uploadError);
      return res.status(500).json({
        success: false,
        message: 'ფოტოების ატვირთვა ვერ მოხერხდა'
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
      images: imageUrls,
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
      .select('_id from to weight value status createdAt images')
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
// SENDER - განცხადების წაშლა (მხოლოდ sender-მა)
// ============================================

exports.deleteParcelRequest = async (req, res) => {
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
        message: 'თქვენ არ გაქვთ ამ განცხადების წაშლის უფლება'
      });
    }

    // თუ განცხადება უკვე მძღოლის ტრიპზეა მიბმული — გავასუფთაოთ იქიდანაც
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

    await Parcel.findByIdAndDelete(requestId);

    res.json({
      success: true,
      message: 'განცხადება წარმატებით წაიშალა'
    });
  } catch (error) {
    console.error('Error deleting parcel request:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'განცხადება ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'განცხადების წაშლა ვერ მოხერხდა'
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

    // ✅ ატვირთული მანქანის ფოტოები Cloudinary-ზე იტვირთება (memory buffer-იდან)
    // და მუდმივი https URL-ები ბრუნდება, რომლებიც Mongo-ში ინახება
    let imageUrls = [];
    try {
      imageUrls = await uploadManyToCloudinary(req.files, 'ggzavna/trips');
    } catch (uploadError) {
      console.error('❌ Cloudinary upload error (trip):', uploadError);
      return res.status(500).json({
        success: false,
        message: 'ფოტოების ატვირთვა ვერ მოხერხდა'
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
      images: imageUrls,
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
// DRIVER - ტრიპის წაშლა (მხოლოდ driver-მა)
// ============================================

exports.deleteTrip = async (req, res) => {
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
        message: 'თქვენ არ გაქვთ ამ მგზავრობის წაშლის უფლება'
      });
    }

    if (trip.acceptedShippings && trip.acceptedShippings.length > 0) {
      await Parcel.updateMany(
        { _id: { $in: trip.acceptedShippings } },
        {
          $set: {
            status: 'pending',
            acceptedBy: null,
            acceptedTrip: null,
            acceptedAt: null
          }
        }
      );
    }

    await DriverTrip.findByIdAndDelete(tripId);

    res.json({
      success: true,
      message: 'მგზავრობა წარმატებით წაიშალა'
    });
  } catch (error) {
    console.error('Error deleting trip:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'მგზავრობა ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'მგზავრობის წაშლა ვერ მოხერხდა'
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
    }).select('from to description weight value shipDate senderPhone senderName status createdAt images').lean();

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
      images: parcel.images || [],
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

// ============================================
// PICKUP OFFER - მძღოლი ითხოვს ნივთის წაღებას
// ============================================
// ✅ NEW: POST /api/parcels/:parcelId/pickup-offer

exports.requestPickup = async (req, res) => {
  try {
    const { parcelId } = req.params;
    const driverId = req.userId;

    const parcel = await Parcel.findById(parcelId);
    if (!parcel) {
      return res.status(404).json({
        success: false,
        message: 'განცხადება ვერ მოიძებნა'
      });
    }

    if (parcel.senderId.toString() === driverId) {
      return res.status(400).json({
        success: false,
        message: 'საკუთარი განცხადების წაღებას ვერ მოითხოვთ'
      });
    }

    if (parcel.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'ეს განცხადება უკვე დაკავებულია'
      });
    }

    let offer;
    try {
      offer = await PickupOffer.create({
        parcelId: parcel._id,
        driverId,
        senderId: parcel.senderId,
        status: 'pending'
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'თქვენ უკვე გამოგზავნილი გაქვთ მოთხოვნა ამ განცხადებაზე'
        });
      }
      throw err;
    }

    notifyUser(req, parcel.senderId, {
      type: 'pickup_offer',
      title: 'ნივთის წაღების მოთხოვნა',
      body: 'მძღოლს სურს თქვენი ნივთის წაღება',
      offerId: offer._id,
      parcelId: parcel._id
    });

    res.status(201).json({
      success: true,
      data: offer,
      message: 'მოთხოვნა წარმატებით გაიგზავნა'
    });
  } catch (error) {
    console.error('Error requesting pickup:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'განცხადება ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'მოთხოვნის გაგზავნა ვერ მოხერხდა'
    });
  }
};

// ============================================
// PICKUP OFFER - სენდერის შემოსული მოთხოვნები
// ============================================
// ✅ NEW: GET /api/parcels/pickup-offers/incoming

exports.getIncomingOffers = async (req, res) => {
  try {
    const offers = await PickupOffer.find({ senderId: req.userId, status: 'pending' })
      .populate('driverId', 'firstName lastName phone carModel carPlate driverLicenseNumber')
      .populate('parcelId')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      offers: offers || []
    });
  } catch (error) {
    console.error('Error fetching incoming offers:', error);
    res.status(500).json({
      success: false,
      message: 'მოთხოვნების ჩატვირთვა ვერ მოხერხდა'
    });
  }
};

// ============================================
// PICKUP OFFER - ერთი შეთავაზების დეტალები
// ============================================
// ✅ NEW: GET /api/parcels/pickup-offers/:offerId

exports.getOfferDetails = async (req, res) => {
  try {
    const { offerId } = req.params;

    const offer = await PickupOffer.findById(offerId)
      .populate('driverId', 'firstName lastName phone carModel carPlate driverLicenseNumber')
      .populate('senderId', 'firstName lastName phone')
      .populate('parcelId')
      .lean();

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'შეთავაზება ვერ მოიძებნა'
      });
    }

    const driverIdStr = offer.driverId?._id?.toString() || offer.driverId?.toString();
    const senderIdStr = offer.senderId?._id?.toString() || offer.senderId?.toString();

    if (req.userId !== driverIdStr && req.userId !== senderIdStr) {
      return res.status(403).json({
        success: false,
        message: 'თქვენ არ გაქვთ ამ შეთავაზების ნახვის უფლება'
      });
    }

    res.json({
      success: true,
      data: offer
    });
  } catch (error) {
    console.error('Error fetching offer details:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'შეთავაზება ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'შეთავაზების ჩატვირთვა ვერ მოხერხდა'
    });
  }
};

// ============================================
// PICKUP OFFER - სენდერის პასუხი (დათანხმება/უარყოფა)
// ============================================
// ✅ NEW: PUT /api/parcels/pickup-offers/:offerId/respond

exports.respondToOffer = async (req, res) => {
  try {
    const { offerId } = req.params;
    const { accept } = req.body;

    const offer = await PickupOffer.findById(offerId);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'შეთავაზება ვერ მოიძებნა'
      });
    }

    if (offer.senderId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'თქვენ არ გაქვთ ამ შეთავაზებაზე პასუხის უფლება'
      });
    }

    if (offer.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'ამ შეთავაზებაზე პასუხი უკვე გაცემულია'
      });
    }

    const parcel = await Parcel.findById(offer.parcelId);
    if (!parcel) {
      return res.status(404).json({
        success: false,
        message: 'განცხადება ვერ მოიძებნა'
      });
    }

    if (accept) {
      offer.status = 'in-transit';
      offer.respondedAt = new Date();
      await offer.save();

      parcel.status = 'accepted';
      parcel.acceptedBy = offer.driverId;
      parcel.acceptedAt = new Date();
      await parcel.save();

      // ✅ დანარჩენი მოლოდინში მყოფი მოთხოვნები ამავე განცხადებაზე
      // ავტომატურად უარყოფილია, რადგან ნივთი უკვე დაკავებულია
      await PickupOffer.updateMany(
        { parcelId: parcel._id, _id: { $ne: offer._id }, status: 'pending' },
        { $set: { status: 'rejected', respondedAt: new Date() } }
      );

      notifyUser(req, offer.driverId, {
        type: 'pickup_offer_accepted',
        title: 'მოთხოვნა დამტკიცდა',
        body: 'გამგზავნმა დაეთანხმა თქვენს მოთხოვნას',
        offerId: offer._id,
        parcelId: parcel._id
      });
    } else {
      offer.status = 'rejected';
      offer.respondedAt = new Date();
      await offer.save();

      notifyUser(req, offer.driverId, {
        type: 'pickup_offer_rejected',
        title: 'მოთხოვნა უარყოფილია',
        body: 'გამგზავნმა უარყო თქვენი მოთხოვნა',
        offerId: offer._id,
        parcelId: parcel._id
      });
    }

    res.json({
      success: true,
      data: offer,
      message: accept ? 'მოთხოვნა დამტკიცებულია' : 'მოთხოვნა უარყოფილია'
    });
  } catch (error) {
    console.error('Error responding to offer:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'შეთავაზება ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'პასუხის გაცემა ვერ მოხერხდა'
    });
  }
};

// ============================================
// PICKUP OFFER - მძღოლი აღნიშნავს დასრულებას
// ============================================
// ✅ NEW: PUT /api/parcels/pickup-offers/:offerId/complete-by-driver

exports.markPickupCompleteByDriver = async (req, res) => {
  try {
    const { offerId } = req.params;

    const offer = await PickupOffer.findById(offerId);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'შეთავაზება ვერ მოიძებნა'
      });
    }

    if (offer.driverId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'თქვენ არ გაქვთ ამ შეთავაზების განახლების უფლება'
      });
    }

    if (offer.status !== 'in-transit') {
      return res.status(400).json({
        success: false,
        message: 'შეთავაზების სტატუსი არ იძლევა ამის საშუალებას'
      });
    }

    offer.driverConfirmedComplete = true;

    if (offer.senderConfirmedComplete) {
      offer.status = 'delivered';
      offer.completedAt = new Date();

      const parcel = await Parcel.findById(offer.parcelId);
      if (parcel) {
        parcel.status = 'delivered';
        parcel.deliveredAt = new Date();
        await parcel.save();
      }
    }

    await offer.save();

    notifyUser(req, offer.senderId, {
      type: 'pickup_offer_driver_completed',
      title: 'მძღოლმა დაასრულა',
      body: 'მძღოლმა აღნიშნა, რომ მიწოდება დასრულებულია — გთხოვთ დაადასტუროთ',
      offerId: offer._id,
      parcelId: offer.parcelId
    });

    res.json({
      success: true,
      data: offer,
      message: 'დასრულების ნიშანი წარმატებით დაფიქსირდა'
    });
  } catch (error) {
    console.error('Error marking pickup complete by driver:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'შეთავაზება ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'დასრულების დაფიქსირება ვერ მოხერხდა'
    });
  }
};

// ============================================
// PICKUP OFFER - სენდერის საბოლოო დადასტურება
// ============================================
// ✅ NEW: PUT /api/parcels/pickup-offers/:offerId/complete-by-sender

exports.confirmPickupCompleteBySender = async (req, res) => {
  try {
    const { offerId } = req.params;

    const offer = await PickupOffer.findById(offerId);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'შეთავაზება ვერ მოიძებნა'
      });
    }

    if (offer.senderId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'თქვენ არ გაქვთ ამ შეთავაზების დადასტურების უფლება'
      });
    }

    if (offer.status !== 'in-transit') {
      return res.status(400).json({
        success: false,
        message: 'შეთავაზების სტატუსი არ იძლევა ამის საშუალებას'
      });
    }

    if (!offer.driverConfirmedComplete) {
      return res.status(400).json({
        success: false,
        message: 'მძღოლს ჯერ არ დაუდასტურებია დასრულება'
      });
    }

    offer.senderConfirmedComplete = true;
    offer.status = 'delivered';
    offer.completedAt = new Date();
    await offer.save();

    const parcel = await Parcel.findById(offer.parcelId);
    if (parcel) {
      parcel.status = 'delivered';
      parcel.deliveredAt = new Date();
      await parcel.save();
    }

    notifyUser(req, offer.driverId, {
      type: 'pickup_offer_sender_confirmed',
      title: 'მიწოდება დადასტურდა',
      body: 'გამგზავნმა დაადასტურა მიწოდების დასრულება',
      offerId: offer._id,
      parcelId: offer.parcelId
    });

    res.json({
      success: true,
      data: offer,
      message: 'მიწოდება წარმატებით დასრულდა'
    });
  } catch (error) {
    console.error('Error confirming pickup complete by sender:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'შეთავაზება ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'დადასტურება ვერ მოხერხდა'
    });
  }
};

// ============================================
// PICKUP OFFER - მიმდინარე მიწოდებები (accepted/in-transit)
// ============================================
// ✅ NEW: GET /api/parcels/pickup-offers/my-in-progress

exports.getMyInProgressOffers = async (req, res) => {
  try {
    const userId = req.userId;

    const offers = await PickupOffer.find({
      $or: [{ senderId: userId }, { driverId: userId }],
      status: { $in: ['accepted', 'in-transit'] }
    })
      .populate('driverId', 'firstName lastName phone carModel carPlate')
      .populate('senderId', 'firstName lastName phone')
      .populate('parcelId')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      offers: offers || []
    });
  } catch (error) {
    console.error('Error fetching in-progress offers:', error);
    res.status(500).json({
      success: false,
      message: 'მიმდინარე მიწოდებების ჩატვირთვა ვერ მოხერხდა'
    });
  }
};

// ============================================
// PICKUP OFFER - ჩემი გაგზავნილი ნივთები (სენდერი, delivered)
// ============================================
// ✅ NEW: GET /api/parcels/pickup-offers/my-sent-completed

exports.getMySentCompleted = async (req, res) => {
  try {
    const offers = await PickupOffer.find({ senderId: req.userId, status: 'delivered' })
      .populate('driverId', 'firstName lastName phone carModel carPlate')
      .populate('parcelId')
      .sort({ completedAt: -1 })
      .lean();

    res.json({
      success: true,
      offers: offers || []
    });
  } catch (error) {
    console.error('Error fetching sent completed offers:', error);
    res.status(500).json({
      success: false,
      message: 'გაგზავნილი ნივთების ჩატვირთვა ვერ მოხერხდა'
    });
  }
};

// ============================================
// PICKUP OFFER - ჩემი წაღებული ნივთები (მძღოლი, delivered)
// ============================================
// ✅ NEW: GET /api/parcels/pickup-offers/my-picked-up-completed

exports.getMyPickedUpCompleted = async (req, res) => {
  try {
    const offers = await PickupOffer.find({ driverId: req.userId, status: 'delivered' })
      .populate('senderId', 'firstName lastName phone')
      .populate('parcelId')
      .sort({ completedAt: -1 })
      .lean();

    res.json({
      success: true,
      offers: offers || []
    });
  } catch (error) {
    console.error('Error fetching picked-up completed offers:', error);
    res.status(500).json({
      success: false,
      message: 'წაღებული ნივთების ჩატვირთვა ვერ მოხერხდა'
    });
  }
};


// ============================================
// TRIP PICKUP REQUEST - გამგზავნი ითხოვს კონკრეტულ ტრიპზე ჩატვირთვას
// ============================================
// ✅ NEW: POST /api/parcels/driver/:tripId/pickup-request

exports.sendTripPickupRequest = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { message } = req.body || {};
    const senderId = req.userId;

    const trip = await DriverTrip.findById(tripId);
    if (!trip) {
      return res.status(404).json({
        success: false,
        message: 'მგზავრობა ვერ მოიძებნა'
      });
    }

    if (trip.driverId.toString() === senderId) {
      return res.status(400).json({
        success: false,
        message: 'საკუთარ მგზავრობაზე მოთხოვნას ვერ გააგზავნით'
      });
    }

    if (trip.status === 'cancelled' || trip.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'ეს მგზავრობა აღარ არის აქტიური'
      });
    }

    let request;
    try {
      request = await TripPickupRequest.create({
        tripId: trip._id,
        driverId: trip.driverId,
        senderId,
        message: message || '',
        status: 'pending'
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'თქვენ უკვე გამოგზავნილი გაქვთ მოთხოვნა ამ მგზავრობაზე'
        });
      }
      throw err;
    }

    notifyUser(req, trip.driverId, {
      type: 'trip_pickup_request',
      title: 'ახალი მოთხოვნა',
      body: 'გამგზავნს სურს თქვენს მგზავრობაზე ნივთის გაგზავნა',
      tripId: trip._id,
      requestId: request._id
    });

    res.status(201).json({
      success: true,
      data: request,
      message: 'მოთხოვნა წარმატებით გაიგზავნა'
    });
  } catch (error) {
    console.error('Error sending trip pickup request:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'მგზავრობა ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'მოთხოვნის გაგზავნა ვერ მოხერხდა'
    });
  }
};

// ============================================
// TRIP PICKUP REQUEST - მძღოლის შემოსული მოთხოვნები
// ============================================
// ✅ NEW: GET /api/parcels/driver/pickup-requests/incoming

exports.getIncomingTripRequests = async (req, res) => {
   try {
    const requests = await TripPickupRequest.find({ driverId: req.userId })
      .populate('senderId', 'firstName lastName phone')
      .populate('tripId')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      requests: requests || []
    });
  } catch (error) {
    console.error('Error fetching incoming trip requests:', error);
    res.status(500).json({
      success: false,
      message: 'მოთხოვნების ჩატვირთვა ვერ მოხერხდა'
    });
  }
};

// ============================================
// TRIP PICKUP REQUEST - მძღოლის პასუხი (დათანხმება/უარყოფა)
// ============================================
// ✅ NEW: PUT /api/parcels/driver/pickup-requests/:requestId/respond

exports.respondToTripPickupRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { accept } = req.body;

    const request = await TripPickupRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'მოთხოვნა ვერ მოიძებნა'
      });
    }

    if (request.driverId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'თქვენ არ გაქვთ ამ მოთხოვნაზე პასუხის უფლება'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'ამ მოთხოვნაზე პასუხი უკვე გაცემულია'
      });
    }

    request.status = accept ? 'accepted' : 'rejected';
    request.respondedAt = new Date();
    await request.save();

    // ✅ პასუხი უკან მიდის გამომგზავნთან — socket-ის notifyUser helper-ით
    notifyUser(req, request.senderId, {
      type: accept ? 'trip_pickup_request_accepted' : 'trip_pickup_request_rejected',
      title: accept ? 'მოთხოვნა დათანხმდა' : 'მოთხოვნა უარყოფილია',
      body: accept
        ? 'მძღოლმა დაათანხმა თქვენი მოთხოვნა'
        : 'მძღოლმა უარყო თქვენი მოთხოვნა',
      tripId: request.tripId,
      requestId: request._id
    });

    res.json({
      success: true,
      data: request,
      message: accept ? 'მოთხოვნა დათანხმებულია' : 'მოთხოვნა უარყოფილია'
    });
  } catch (error) {
    console.error('Error responding to trip pickup request:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'მოთხოვნა ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'პასუხის გაცემა ვერ მოხერხდა'
    });
  }
};

exports.getMyOutgoingTripRequests = async (req, res) => {
  try {
    const requests = await TripPickupRequest.find({ senderId: req.userId })
      .populate('driverId', 'firstName lastName phone carModel carPlate')
      .populate('tripId')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      requests: requests || []
    });
  } catch (error) {
    console.error('Error fetching outgoing trip requests:', error);
    res.status(500).json({
      success: false,
      message: 'მოთხოვნების ჩატვირთვა ვერ მოხერხდა'
    });
  }
};
   exports.deleteTripPickupRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await TripPickupRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'მოთხოვნა ვერ მოიძებნა'
      });
    }

    const isSender = request.senderId.toString() === req.userId;
    const isDriver = request.driverId.toString() === req.userId;

    if (!isSender && !isDriver) {
      return res.status(403).json({
        success: false,
        message: 'თქვენ არ გაქვთ ამ მოთხოვნის წაშლის უფლება'
      });
    }

    if (request.status !== 'rejected') {
      return res.status(400).json({
        success: false,
        message: 'წაშლა შესაძლებელია მხოლოდ უარყოფილი მოთხოვნებისთვის'
      });
    }

    await TripPickupRequest.findByIdAndDelete(requestId);

    res.json({
      success: true,
      message: 'მოთხოვნა წარმატებით წაიშალა'
    });
  } catch (error) {
    console.error('Error deleting trip pickup request:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'მოთხოვნა ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'მოთხოვნის წაშლა ვერ მოხერხდა'
    });
  }
};
exports.getMyOutgoingPickupOffers = async (req, res) => {
  try {
    const offers = await PickupOffer.find({ driverId: req.userId })
      .populate('senderId', 'firstName lastName phone')
      .populate('parcelId')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      offers: offers || []
    });
  } catch (error) {
    console.error('Error fetching outgoing pickup offers:', error);
    res.status(500).json({
      success: false,
      message: 'შეთავაზებების ჩატვირთვა ვერ მოხერხდა'
    });
  }
};
 
exports.deletePickupOffer = async (req, res) => {
  try {
    const { offerId } = req.params;

    const offer = await PickupOffer.findById(offerId);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'შეთავაზება ვერ მოიძებნა'
      });
    }

    const isDriver = offer.driverId.toString() === req.userId;
    const isSender = offer.senderId.toString() === req.userId;

    if (!isDriver && !isSender) {
      return res.status(403).json({
        success: false,
        message: 'თქვენ არ გაქვთ ამ შეთავაზების წაშლის უფლება'
      });
    }

    if (offer.status !== 'rejected') {
      return res.status(400).json({
        success: false,
        message: 'წაშლა შესაძლებელია მხოლოდ უარყოფილი შეთავაზებებისთვის'
      });
    }

    await PickupOffer.findByIdAndDelete(offerId);

    res.json({
      success: true,
      message: 'შეთავაზება წარმატებით წაიშალა'
    });
  } catch (error) {
    console.error('Error deleting pickup offer:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'შეთავაზება ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'შეთავაზების წაშლა ვერ მოხერხდა'
    });
  }
};


module.exports = exports;