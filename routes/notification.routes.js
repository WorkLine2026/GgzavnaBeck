const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const notificationController = require('../controllers/notification.controller');

router.get('/pending', authMiddleware, notificationController.getPendingNotifications);
router.put('/mark-seen', authMiddleware, notificationController.markNotificationsSeen);

module.exports = router;