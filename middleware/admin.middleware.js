const User = require('../models/User');

/**
 * ✅ adminMiddleware
 *
 * ყოველთვის გამოიყენეთ authMiddleware-ის ᲨᲔᲛᲓᲔᲒ:
 *   router.get('/admin/...', authMiddleware, adminMiddleware, controller.fn)
 *
 * თავად JWT-ს role-ს არ ვენდობით (რადგან token 7 დღით ცოცხალია და
 * თუ user-ის role შუალედში შეიცვალა/დაიბლოკა, ძველი token-ით მაინც
 * გაივლიდა შემოწმებას) — ამიტომ ყოველ მოთხოვნაზე DB-დან ვამოწმებთ
 * რეალურ, ცოცხალ role-ს.
 */
module.exports = async function adminMiddleware(req, res, next) {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        message: 'ავტორიზაცია საჭიროა'
      });
    }

    const user = await User.findById(req.userId).select('role isBanned');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'მომხმარებელი ვერ მოიძებნა'
      });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'წვდომა აკრძალულია — მხოლოდ ადმინისტრატორისთვის'
      });
    }

    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: 'თქვენი ანგარიში დაბლოკილია'
      });
    }

    req.isAdmin = true;
    next();
  } catch (error) {
    console.error('ADMIN MIDDLEWARE ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'სერვერის შეცდომა ავტორიზაციისას'
    });
  }
};