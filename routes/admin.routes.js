const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authMiddleware = require('../middleware/auth.middleware');
const adminMiddleware = require('../middleware/admin.middleware');

// ⚠️ ორივე middleware ყველა route-ზე: ჯერ authMiddleware (token ვალიდურია?),
// შემდეგ adminMiddleware (ეს user admin არის?)
router.use(authMiddleware, adminMiddleware);

// ================== DASHBOARD ==================
router.get('/stats', adminController.getDashboardStats);

// ================== USERS ==================
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserById);
router.put('/users/:userId/role', adminController.updateUserRole);
router.put('/users/:userId/ban', adminController.setUserBanStatus);
router.delete('/users/:userId', adminController.deleteUser);

// ================== PARCEL REQUESTS ==================
router.get('/requests', adminController.getAllRequestsAdmin);
router.put('/requests/:requestId/status', adminController.forceUpdateRequestStatus);
router.delete('/requests/:requestId', adminController.forceDeleteRequest);

// ================== DRIVER TRIPS ==================
router.get('/trips', adminController.getAllTripsAdmin);
router.put('/trips/:tripId/cancel', adminController.forceCancelTrip);
router.delete('/trips/:tripId', adminController.forceDeleteTrip);

module.exports = router;