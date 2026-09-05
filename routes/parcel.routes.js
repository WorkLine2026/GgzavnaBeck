// 📂 backend/routes/parcel.routes.js

const express = require('express');
const router = express.Router();
const parcelController = require('../controllers/parcel.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { imageUpload } = require('../middleware/upload.middleware');


router.get('/recent-requests', parcelController.getRecentRequests);
router.get('/driver/recent-trips', parcelController.getRecentTrips);
router.get('/driver/trip/:tripId', parcelController.getTripDetailsPublic);

router.post(
  '/request',
  authMiddleware,
  imageUpload.array('images', 3),
  parcelController.createParcelRequest
);

router.get('/my-requests', authMiddleware, parcelController.getUserRequests);
router.get('/request/:requestId', parcelController.getParcelRequestById);
router.put('/request/:requestId/status', authMiddleware, parcelController.updateParcelStatus);
router.post('/request/:requestId/republish', authMiddleware, parcelController.republishRequest);
router.delete('/request/:requestId', authMiddleware, parcelController.deleteParcelRequest);

router.post(
  '/driver/create-trip',
  authMiddleware,
  imageUpload.array('images', 3),
  parcelController.createTrip
);

router.get('/driver/my-trips', authMiddleware, parcelController.getDriverTrips);
router.get('/driver/stats', authMiddleware, parcelController.getDriverStats);
router.get('/driver/earnings', authMiddleware, parcelController.getEarningsReport);
router.get('/driver/reviews', authMiddleware, parcelController.getDriverReviews);
router.get('/driver/pickup-requests/incoming', authMiddleware, parcelController.getIncomingTripRequests);
router.get('/driver/pickup-requests/my-sent', authMiddleware, parcelController.getMyOutgoingTripRequests);
router.put('/driver/pickup-requests/:requestId/respond', authMiddleware, parcelController.respondToTripPickupRequest);
router.delete('/driver/pickup-requests/:requestId', authMiddleware, parcelController.deleteTripPickupRequest);
router.post('/driver/:tripId/pickup-request', authMiddleware, parcelController.sendTripPickupRequest);
router.get('/driver/:tripId', authMiddleware, parcelController.getTrip);
router.put('/driver/:tripId', authMiddleware, parcelController.updateTrip);
router.put('/driver/:tripId/cancel', authMiddleware, parcelController.cancelTrip);
router.put('/driver/:tripId/complete', authMiddleware, parcelController.completeTrip);
router.delete('/driver/:tripId', authMiddleware, parcelController.deleteTrip);

router.get('/available-shippings', authMiddleware, parcelController.getAvailableShippings);

// ⚠️ ყველა კონკრეტული /pickup-offers/... route სულ ბოლო, დინამიური /pickup-offers/:offerId-მდე უნდა იდგეს!
router.get('/pickup-offers/incoming', authMiddleware, parcelController.getIncomingOffers);
router.get('/pickup-offers/my-in-progress', authMiddleware, parcelController.getMyInProgressOffers);
router.get('/pickup-offers/my-sent', authMiddleware, parcelController.getMyOutgoingPickupOffers);
router.get('/pickup-offers/my-sent-completed', authMiddleware, parcelController.getMySentCompleted);
router.get('/pickup-offers/my-picked-up-completed', authMiddleware, parcelController.getMyPickedUpCompleted);

// 👇 დინამიური :offerId route ყოველთვის ბოლოს, კონკრეტული სტრინგების შემდეგ
router.get('/pickup-offers/:offerId', authMiddleware, parcelController.getOfferDetails);
router.put('/pickup-offers/:offerId/respond', authMiddleware, parcelController.respondToOffer);
router.put('/pickup-offers/:offerId/complete-by-driver', authMiddleware, parcelController.markPickupCompleteByDriver);
router.put('/pickup-offers/:offerId/complete-by-sender', authMiddleware, parcelController.confirmPickupCompleteBySender);
router.delete('/pickup-offers/:offerId', authMiddleware, parcelController.deletePickupOffer);

router.post('/:parcelId/pickup-offer', authMiddleware, parcelController.requestPickup);
router.post('/:shippingId/accept', authMiddleware, parcelController.acceptShipping);
router.post('/:shippingId/reject', authMiddleware, parcelController.rejectShipping);
router.post('/:shippingId/pickup', authMiddleware, parcelController.pickupShipping);
router.post('/:shippingId/deliver', authMiddleware, parcelController.deliverShipping);

module.exports = router;