const { Parcel, DriverTrip } = require('../models');

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
      senderId: req.userId,  // ✅ middleware-დან მოდის
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
// SENDER - ჩემი განცხადებები ✅ NEW
// ============================================

exports.getUserRequests = async (req, res) => {
  try {
    const userId = req.userId; // authMiddleware-დან

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'არ დაა ავტორიზებული'
      });
    }

    // ✅ დაბრუნებული Request-ები სადაც userId = sender
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
      driverId: req.userId,  // ✅ middleware-დან მოდის
      from,
      to,
      departureDate: new Date(departureDate),
      availableSpace,
      pricePerKg,
      carModel: carModel || '',
      carPlate: carPlate || '',
      comments: comments || '',
      status: status || 'active',
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

    // ✅ Find pending parcels that match the route and date
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
      acceptedBy: null // უჯერელი
    }).select('parcelDetails senderPhone senderEmail status createdAt').lean();

    // ✅ Transform to AvailableShipping format
    const formattedShippings = shippings.map(parcel => ({
      _id: parcel._id,
      parcelDetails: {
        from: parcel.from,
        to: parcel.to,
        description: parcel.description,
        weight: parcel.weight,
        value: parcel.value,
        shipDate: parcel.shipDate
      },
      senderName: parcel.senderName || 'უსახელო გამგზავნელი',
      senderPhone: parcel.senderPhone,
      senderEmail: parcel.senderEmail || '',
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

    // ✅ Find Parcel
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

    // ✅ Update Parcel
    parcel.status = 'accepted';
    parcel.acceptedBy = req.userId;  // ✅ middleware-დან მოდის
    parcel.acceptedAt = new Date();
    await parcel.save();

    // ✅ Add to Driver's Trip (ის ამ მომენტში აქტიურ ტრიპის)
    const activeTrip = await DriverTrip.findOne({
      driverId: req.userId,  // ✅ middleware-დან მოდის
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

// ============================================
// UTILITY - დაკამპირებული ფორმატი
// ============================================

const formatParcelResponse = (parcel) => {
  return {
    _id: parcel._id,
    parcelDetails: {
      from: parcel.from,
      to: parcel.to,
      description: parcel.description,
      weight: parcel.weight,
      value: parcel.value,
      shipDate: parcel.shipDate
    },
    senderName: parcel.senderName || 'უსახელო გამგზავნელი',
    senderPhone: parcel.senderPhone,
    senderEmail: parcel.senderEmail || '',
    status: parcel.status,
    createdAt: parcel.createdAt
  };
};