// 📂 backend/controllers/review.controller.js

const { PickupOffer, Review } = require('../models');
const User = require('../models/User');

// ============================================
// ⭐ შეფასების გაგზავნა
// ============================================
// POST /api/parcels/pickup-offers/:offerId/review
// body: { rating: 1..5, comment?: string }
//
// გამგზავნი აფასებს მძღოლს, მძღოლი — გამგზავნს.
// შესაძლებელია მხოლოდ delivered სტატუსის შემდეგ და ერთხელ.

exports.submitOfferReview = async (req, res) => {
  try {
    const { offerId } = req.params;
    const rating = Number(req.body?.rating);
    const comment = String(req.body?.comment || '').trim().slice(0, 500);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'შეფასება უნდა იყოს 1-დან 5-მდე'
      });
    }

    const offer = await PickupOffer.findById(offerId);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'შეთავაზება ვერ მოიძებნა'
      });
    }

    if (offer.status !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'შეფასება შესაძლებელია მხოლოდ დასრულებული მიწოდების შემდეგ'
      });
    }

    const isDriver = offer.driverId.toString() === req.userId;
    const isSender = offer.senderId.toString() === req.userId;

    if (!isDriver && !isSender) {
      return res.status(403).json({
        success: false,
        message: 'თქვენ არ გაქვთ ამ შეთავაზების შეფასების უფლება'
      });
    }

    if ((isSender && offer.reviewedBySender) || (isDriver && offer.reviewedByDriver)) {
      return res.status(409).json({
        success: false,
        message: 'თქვენ უკვე შეაფასეთ'
      });
    }

    const targetId = isSender ? offer.driverId : offer.senderId;
    const targetRole = isSender ? 'driver' : 'sender';

    try {
      await Review.create({
        offerId: offer._id,
        reviewerId: req.userId,
        targetId,
        targetRole,
        rating,
        comment
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'თქვენ უკვე შეაფასეთ'
        });
      }
      throw err;
    }

    if (isSender) {
      offer.reviewedBySender = true;
    } else {
      offer.reviewedByDriver = true;
    }
    await offer.save();

    // რეიტინგის ხელახალი გადათვლა ყველა შეფასებიდან
    const agg = await Review.aggregate([
      { $match: { targetId } },
      { $group: { _id: '$targetId', avg: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);

    const ratingAvg = agg[0] ? Math.round(agg[0].avg * 10) / 10 : 0;
    const ratingCount = agg[0] ? agg[0].count : 0;

    await User.findByIdAndUpdate(targetId, { ratingAvg, ratingCount });

    res.status(201).json({
      success: true,
      message: 'შეფასება წარმატებით გაიგზავნა'
    });
  } catch (error) {
    console.error('Error submitting review:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'შეთავაზება ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'შეფასების გაგზავნა ვერ მოხერხდა'
    });
  }
};

// ============================================
// ⭐ მომხმარებლის რეიტინგის სტატისტიკა
// ============================================
// GET /api/users/:userId/rating-stats

exports.getUserRatingStats = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('ratingAvg ratingCount')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'მომხმარებელი ვერ მოიძებნა'
      });
    }

    res.json({
      success: true,
      stats: {
        ratingAvg: user.ratingAvg || 0,
        ratingCount: user.ratingCount || 0
      }
    });
  } catch (error) {
    console.error('Error fetching rating stats:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'მომხმარებელი ვერ მოიძებნა'
      });
    }
    res.status(500).json({
      success: false,
      message: 'რეიტინგის ჩატვირთვა ვერ მოხერხდა'
    });
  }
};