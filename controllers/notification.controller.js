const Notification = require('../models/Notification');

// GET /api/notifications/pending
exports.getPendingNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipientId: req.userId,
      seen: false
    })
      .sort({ createdAt: 1 })
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
      message: 'შეტყობინებების ჩატვირთვა ვერ მოხერხდა'
    });
  }
};

// PUT /api/notifications/mark-seen
exports.markNotificationsSeen = async (req, res) => {
  try {
    const { ids } = req.body || {};

    const filter = { recipientId: req.userId, seen: false };
    if (Array.isArray(ids) && ids.length > 0) {
      filter._id = { $in: ids };
    }

    await Notification.updateMany(filter, { $set: { seen: true } });

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notifications seen:', error);
    res.status(500).json({
      success: false,
      message: 'სტატუსის განახლება ვერ მოხერხდა'
    });
  }
};