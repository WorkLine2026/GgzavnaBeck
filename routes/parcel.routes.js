const express = require('express');
const router = express.Router();
const parcelController = require('../controllers/parcel.controller');
const authMiddleware = require('../middleware/auth.middleware');

// ================== SENDER ROUTES ==================

/**
 * POST /api/parcels/request
 * sender-ი ქმნის გაგზავნის განცხადებას
 */
router.post('/request', authMiddleware, parcelController.createParcelRequest);

/**
 * GET /api/parcels/my-requests ✅ NEW
 * sender-ი იღებს თავის განცხადებებს
 */
router.get('/my-requests', authMiddleware, parcelController.getUserRequests);

// ================== DRIVER ROUTES ==================

/**
 * POST /api/parcels/driver/create-trip
 * driver-ი ქმნის ტრიპს
 */
router.post('/driver/create-trip', authMiddleware, parcelController.createTrip);

/**
 * GET /api/parcels/driver/available-shippings
 * driver-ი იღებს ხელმისაწვდომ გაგზავნებს
 * Query params: ?from=X&to=Y&departureDate=YYYY-MM-DD
 */
router.get('/driver/available-shippings', authMiddleware, parcelController.getAvailableShippings);

/**
 * POST /api/parcels/driver/accept-shipping/:shippingId
 * driver-ი იღებს გაგზავნას
 */
router.post('/driver/accept-shipping/:shippingId', authMiddleware, parcelController.acceptShipping);

module.exports = router;