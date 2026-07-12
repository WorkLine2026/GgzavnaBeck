// 📂 backend/routes/parcel.routes.js

const express = require('express');
const router = express.Router();
const parcelController = require('../controllers/parcel.controller');
const authMiddleware = require('../middleware/auth.middleware');

// ================== PUBLIC ROUTES (NO AUTH) ==================

/**
 * GET /api/parcels/recent-requests ⭐ PUBLIC
 * აჩვენებს ბოლო 6 განცხადებას (home page)
 */
router.get('/recent-requests', parcelController.getRecentRequests);

/**
 * GET /api/parcels/driver/recent-trips ⭐ PUBLIC
 * აჩვენებს ბოლო 6 მგზავრობას (home page)
 */
router.get('/driver/recent-trips', parcelController.getRecentTrips);

// ================== SENDER ROUTES (AUTHENTICATED) ==================

/**
 * POST /api/parcels/request
 * sender-ი ქმნის გაგზავნის განცხადებას
 */
router.post('/request', authMiddleware, parcelController.createParcelRequest);

/**
 * GET /api/parcels/my-requests
 * sender-ი იღებს თავის განცხადებებს (მხოლოდ ის თავისთავის)
 */
router.get('/my-requests', authMiddleware, parcelController.getUserRequests);

// ================== DRIVER ROUTES (AUTHENTICATED) ==================

/**
 * POST /api/parcels/driver/create-trip
 * driver-ი ქმნის ტრიპს
 */
router.post('/driver/create-trip', authMiddleware, parcelController.createTrip);

/**
 * GET /api/parcels/driver/my-trips
 * driver-ი იღებს თავის მგზავრობებს (მხოლოდ ის თავისთავის)
 */
router.get('/driver/my-trips', authMiddleware, parcelController.getDriverTrips);

/**
 * GET /api/parcels/driver/stats
 * driver-ი იღებს მის სტატისტიკას
 */
router.get('/driver/stats', authMiddleware, parcelController.getDriverStats);

/**
 * GET /api/parcels/available-shippings
 * driver-ი იღებს ხელმისაწვდომ გაგზავნებს
 * Query params: ?from=X&to=Y&departureDate=YYYY-MM-DD
 */
router.get('/available-shippings', authMiddleware, parcelController.getAvailableShippings);

/**
 * POST /api/parcels/:shippingId/accept
 * driver-ი იღებს გაგზავნას
 */
router.post('/:shippingId/accept', authMiddleware, parcelController.acceptShipping);

module.exports = router;