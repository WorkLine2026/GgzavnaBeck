// middleware/auth.middleware.js
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ authMiddleware: Authorization header არაა ან არასწორია');
      return res.status(401).json({
        success: false,
        message: 'Authorization header not provided'
      });
    }

    const token = authHeader.split(' ')[1];
    console.log('🔍 authMiddleware: token:', token);

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    );
    console.log('✅ authMiddleware: decoded payload:', decoded);

    // ✅ შენს JWT payload-ს შესაბამისად: { userId, email, role }
    req.userId = decoded.userId?.toString();
    req.user = decoded;

    console.log('✅ authMiddleware: req.userId:', req.userId);

    if (!req.userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    next();
  } catch (err) {
    console.error('❌ authMiddleware error:', err.message);
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};