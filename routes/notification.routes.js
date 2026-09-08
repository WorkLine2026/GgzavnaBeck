// 📂 backend/routes/notification.routes.js

const express = require('express');
const router = express.Router();

const notificationController = require('../controllers/notification.controller');
const authMiddleware = require('../middleware/auth.middleware');

// GET /api/notifications/recent — ბოლო 30 შეტყობინება
router.get('/recent', authMiddleware, notificationController.getRecentNotifications);

// GET /api/notifications/pending — მხოლოდ წაუკითხავი
router.get('/pending', authMiddleware, notificationController.getPendingNotifications);

// PUT /api/notifications/mark-seen — მონიშვნა წაკითხულად
router.put('/mark-seen', authMiddleware, notificationController.markNotificationsSeen);

// DELETE /api/notifications/clear-all — ყველას წაშლა
router.delete('/clear-all', authMiddleware, notificationController.clearAllNotifications);

module.exports = router;