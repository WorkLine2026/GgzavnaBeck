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

// ================== PARCEL REQUEST DETAIL ==================
// ⚠️ ეს route-ები აუცილებლად უნდა იყოს '/:shippingId/accept'-ის და
// მსგავსი "ერთპარამეტრიანი" route-ების წინ, თორემ Express
// '/request/...'-საც შეცდომით '/:shippingId'-ად აღიქვამს.

/**
 * GET /api/parcels/request/:requestId  ⭐ PUBLIC
 * კონკრეტული განცხადების დეტალები (request-detail გვერდისთვის)
 */
router.get('/request/:requestId', parcelController.getParcelRequestById);

/**
 * PUT /api/parcels/request/:requestId/status
 * მხოლოდ sender-ს შეუძლია საკუთარი განცხადების სტატუსის შეცვლა
 */
router.put('/request/:requestId/status', authMiddleware, parcelController.updateParcelStatus);

/**
 * POST /api/parcels/request/:requestId/republish
 * განცხადების ხელახლა გამოქვეყნება
 */
router.post('/request/:requestId/republish', authMiddleware, parcelController.republishRequest);

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
 * GET /api/parcels/driver/earnings
 * driver-ი იღებს შემოსავლის ანგარიშს (?period=week|month|all)
 */
router.get('/driver/earnings', authMiddleware, parcelController.getEarningsReport);

/**
 * GET /api/parcels/driver/reviews
 * driver-ი იღებს თავის შეფასებებს
 */
router.get('/driver/reviews', authMiddleware, parcelController.getDriverReviews);

/**
 * GET /api/parcels/driver/:tripId
 * კონკრეტული ტრიპის დეტალები (მხოლოდ იმ driver-ისთვის ვინც შექმნა)
 */
router.get('/driver/:tripId', authMiddleware, parcelController.getTrip);
router.get('/driver/recent-trips', parcelController.getRecentTrips);

/**
 * PUT /api/parcels/driver/:tripId
 * ტრიპის განახლება
 */
router.put('/driver/:tripId', authMiddleware, parcelController.updateTrip);

/**
 * PUT /api/parcels/driver/:tripId/cancel
 * ტრიპის გაუქმება
 */
router.put('/driver/:tripId/cancel', authMiddleware, parcelController.cancelTrip);

/**
 * PUT /api/parcels/driver/:tripId/complete
 * ტრიპის დასრულება
 */
router.put('/driver/:tripId/complete', authMiddleware, parcelController.completeTrip);

/**
 * GET /api/parcels/available-shippings
 * driver-ი იღებს ხელმისაწვდომ გაგზავნებს
 * Query params: ?from=X&to=Y&departureDate=YYYY-MM-DD
 */
router.get('/available-shippings', authMiddleware, parcelController.getAvailableShippings);

// ================== RATINGS ==================

/**
 * POST /api/drivers/:driverId/rate — (mounted separately in app.js, see note below)
 * აქ ვტოვებთ parcel router-ში მხოლოდ იმ endpoint-ებს, რომლებიც
 * ParcelService-ში '/api/parcels/...'-ზეა მიმართული.
 */

// ================== SHIPPING ACTIONS (⚠️ ერთპარამეტრიანი route-ები ბოლოს!) ==================

/**
 * POST /api/parcels/:shippingId/accept
 * driver-ი იღებს გაგზავნას
 */
router.post('/:shippingId/accept', authMiddleware, parcelController.acceptShipping);

/**
 * POST /api/parcels/:shippingId/reject
 * driver-ი უარყოფს გაგზავნას
 */
router.post('/:shippingId/reject', authMiddleware, parcelController.rejectShipping);

/**
 * POST /api/parcels/:shippingId/pickup
 * driver-ი აღნიშნავს რომ ავიღო გაგზავნა (in-transit)
 */
router.post('/:shippingId/pickup', authMiddleware, parcelController.pickupShipping);

/**
 * POST /api/parcels/:shippingId/deliver
 * driver-ი აღნიშნავს რომ გაგზავნა ჩაბარდა (delivered)
 */
router.post('/:shippingId/deliver', authMiddleware, parcelController.deliverShipping);

module.exports = router;