// 📂 backend/routes/user.routes.js

const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/review.controller');

// ⚠️ ეს import-ი დააკოპირეთ parcel.routes.js-იდან — იგივე სახელით და ფორმით,
// როგორც იქ არის (მაგ. თუ იქ `const { authMiddleware } = require(...)` წერია,
// აქაც ისე ჩაწერეთ)
const authMiddleware = require('../middleware/auth.middleware');

// GET /api/users/:userId/rating-stats
router.get('/:userId/rating-stats', authMiddleware, reviewController.getUserRatingStats);

module.exports = router;