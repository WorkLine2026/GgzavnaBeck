// 📂 backend/controllers/notification.controller.js

const Notification = require('../models/Notification');

// ============================================
// GET /api/notifications/recent
// ============================================
// აბრუნებს ბოლო 30 შეტყობინებას (წაკითხულ-წაუკითხავად ერთად) —
// Messenger-ის სტილის ზარისთვის, სადაც ისტორიაც ჩანს, არა მხოლოდ
// წაუკითხავი. ეს არის სია, რომელსაც ვტვირთავთ socket-ის
// დაკავშირებისას — ბაზა არის source of truth ნებისმიერ device-ზე.

exports.getRecentNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipientId: req.userId
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    res.json({
      success: true,
      notifications: notifications || []
    });
  } catch (error) {
    console.error('Error fetching recent notifications:', error);
    res.status(500).json({
      success: false,
      message: 'შეტყობინებების ჩატვირთვა ვერ მოხერხდა'
    });
  }
};

// ============================================
// GET /api/notifications/pending
// ============================================
// აბრუნებს მხოლოდ წაუნახავ (seen: false) შეტყობინებებს.
// ამჟამად ეს endpoint frontend-ში აღარ გამოიყენება (loadNotificationHistory
// იყენებს /recent-ს), მაგრამ დატოვებულია სამომავლოდ.

exports.getPendingNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipientId: req.userId,
      seen: false
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      notifications: notifications || []
    });
  } catch (error) {
    console.error('Error fetching pending notifications:', error);
    res.status(500).json({
      success: false,
      message: 'მოლოდინში მყოფი შეტყობინებების ჩატვირთვა ვერ მოხერხდა'
    });
  }
};

// ============================================
// PUT /api/notifications/mark-seen
// ============================================
// body: { ids?: string[] } — თუ ids არ არის მოწოდებული, ყველა
// წაუკითხავი შეტყობინება მონიშნავს წაკითხულად.

exports.markNotificationsSeen = async (req, res) => {
  try {
    const { ids } = req.body || {};

    const filter = {
      recipientId: req.userId,
      seen: false
    };

    if (Array.isArray(ids) && ids.length > 0) {
      filter._id = { $in: ids };
    }

    await Notification.updateMany(filter, {
      $set: { seen: true }
    });

    res.json({
      success: true
    });
  } catch (error) {
    console.error('Error marking notifications seen:', error);
    res.status(500).json({
      success: false,
      message: 'სტატუსის განახლება ვერ მოხერხდა'
    });
  }
};

// ============================================
// DELETE /api/notifications/clear-all
// ============================================
// შლის ბაზიდან user-ის ყველა შეტყობინებას — გამოიყენება
// "ყველას გასუფთავება" ღილაკზე ნავბარში, რომ სხვა
// browser/device-ებზეც გაქრეს ეს სია (ბაზა არის source of truth).

exports.clearAllNotifications = async (req, res) => {
  try {
    await Notification.deleteMany({
      recipientId: req.userId
    });

    res.json({
      success: true
    });
  } catch (error) {
    console.error('Error clearing notifications:', error);
    res.status(500).json({
      success: false,
      message: 'შეტყობინებების გასუფთავება ვერ მოხერხდა'
    });
  }
};