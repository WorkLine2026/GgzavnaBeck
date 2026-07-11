const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'ავტორიზაცია საჭიროა'
      });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    );

    // ვამოწმებთ, რომ მომხმარებელი კვლავ არსებობს ბაზაში
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'მომხმარებელი ვერ მოიძებნა'
      });
    }

    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch (error) {
    console.error('AUTH MIDDLEWARE ERROR:', error.message);
    return res.status(401).json({
      success: false,
      message: 'ტოკენი არასწორია ან ვადაგასულია'
    });
  }
};

module.exports = authMiddleware;