const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');

// ================== LOGIN ==================
router.post('/login', authController.login);

// ================== REGISTRATION ==================
router.post('/register', authController.register);

// ================== PHONE VERIFICATION ==================
router.post('/verify-phone', authController.verifyPhone);

// ================== FORGOT PASSWORD ==================
router.post('/forgot-password/phone/send-code', authController.sendForgotPasswordCode);
router.post('/forgot-password/phone/verify-code', authController.verifyForgotPasswordCode);
router.post('/forgot-password/phone/reset-password', authController.resetPassword);

// ================== PROFILE (დაცული routes) ==================
router.get('/me', authMiddleware, authController.getProfile);
router.put('/profile', authMiddleware, authController.updateProfile);
router.delete('/me', authMiddleware, authController.deleteAccount);

module.exports = router;