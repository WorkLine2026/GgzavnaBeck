const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const extra = require('../controllers/admin.extra.controller');
// ⚠️ შეცვალე შენი რეალური ფაილის სახელით (იქ, სადაც getDeletedUsers / getDeletedUserById / getDeletedUserMessages არის)
const deletedController = require('../controllers/adminDeleted.controller');
const authMiddleware = require('../middleware/auth.middleware');
const adminMiddleware = require('../middleware/admin.middleware');

// ✅ ლოგინი ტოკენის გარეშე, აუცილებლად authMiddleware-მდე
router.use(require('./adminAuth'));

// ⚠️ ორივე middleware ყველა route-ზე: ჯერ authMiddleware (token ვალიდურია?),
// შემდეგ adminMiddleware (ეს user admin არის?)
router.use(authMiddleware, adminMiddleware);

// ================== DASHBOARD ==================
router.get('/stats', adminController.getDashboardStats);

// ================== USERS ==================
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserById);
router.get('/users/:userId/extras', extra.getUserExtras); // ✅ NEW
router.put('/users/:userId/role', adminController.updateUserRole);
router.put('/users/:userId/ban', adminController.setUserBanStatus);
router.delete('/users/:userId', adminController.deleteUser);

// ================== PARCEL REQUESTS ==================
router.get('/requests', adminController.getAllRequestsAdmin);
router.put('/requests/:requestId/status', adminController.forceUpdateRequestStatus);
router.delete('/requests/:requestId', adminController.forceDeleteRequest);

// ================== DRIVER TRIPS ==================
router.get('/trips', adminController.getAllTripsAdmin);
router.put('/trips/:tripId/status', adminController.forceUpdateTripStatus);
router.put('/trips/:tripId/cancel', adminController.forceCancelTrip);
router.delete('/trips/:tripId', adminController.forceDeleteTrip);

// ================== PICKUP OFFERS (მძღოლი → ნივთი) ==================
router.get('/offers', adminController.getAllOffersAdmin);
router.delete('/offers/:offerId', adminController.forceDeleteOffer);

// ================== TRIP REQUESTS (გამგზავნი → მგზავრობა) ==================
router.get('/trip-requests', adminController.getAllTripRequestsAdmin);
router.delete('/trip-requests/:requestId', adminController.forceDeleteTripRequest);

// ================== REVIEWS / NOTIFICATIONS / CHAT ✅ NEW ==================
router.get('/reviews', extra.getAllReviewsAdmin);
router.delete('/reviews/:reviewId', extra.forceDeleteReview);
router.get('/notifications', extra.getAllNotificationsAdmin);
router.get('/messages', extra.getAllMessagesAdmin);

// ================== DELETED USERS (არქივი) ==================
// (თუ ეს route-ები სხვაგან გაქვს დარეგისტრირებული, წაშალე ეს 3 ხაზი)
router.get('/deleted-users', deletedController.getDeletedUsers);
router.get('/deleted-users/:id', deletedController.getDeletedUserById);
router.get('/deleted-users/:id/messages', deletedController.getDeletedUserMessages);

module.exports = router;