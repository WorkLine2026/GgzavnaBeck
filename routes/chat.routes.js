const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const Message = require('../models/Message');
const mongoose = require('mongoose');

router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const userStringId = req.userId?.toString();
    if (!userStringId) {
      return res.status(400).json({ success: false, message: 'Missing User ID' });
    }

    const userObjectId = mongoose.Types.ObjectId.isValid(userStringId)
      ? new mongoose.Types.ObjectId(userStringId)
      : null;

    const searchConditions = [
      { senderId: userStringId },
      { recipientId: userStringId }
    ];
    if (userObjectId) {
      searchConditions.push({ senderId: userObjectId });
      searchConditions.push({ recipientId: userObjectId });
    }

    const messages = await Message.find({ $or: searchConditions })
      .populate('senderId', 'firstName lastName')
      .populate('recipientId', 'firstName lastName')
      .sort({ timestamp: -1 })
      .lean();

    if (!messages.length) {
      return res.json({ success: true, conversations: [] });
    }

    const conversationMap = new Map();

    for (const msg of messages) {
      if (!msg.requestId) continue;

      const msgSenderId = (msg.senderId?._id || msg.senderId)?.toString();
      const msgRecipientId = (msg.recipientId?._id || msg.recipientId)?.toString();

      if (msgSenderId !== userStringId && msgRecipientId !== userStringId) continue;

      const isSender = msgSenderId === userStringId;
      let otherUserId = isSender ? msgRecipientId : msgSenderId;
      if (!otherUserId || otherUserId === 'null') continue;

      const key = `${msg.requestId}:${otherUserId}`;

      if (!conversationMap.has(key)) {
        let otherUserName = 'უცნობი მომხმარებელი';
        const otherUserObj = isSender ? msg.recipientId : msg.senderId;

        if (otherUserObj && typeof otherUserObj === 'object') {
          const fullName = `${otherUserObj.firstName || ''} ${otherUserObj.lastName || ''}`.trim();
          if (fullName) otherUserName = fullName;
        } else if (!isSender && msg.senderName) {
          otherUserName = msg.senderName;
        }

        conversationMap.set(key, {
          conversationId: msg.requestId,
          userId: otherUserId,
          userName: otherUserName,
          lastMessage: msg.message || '',
          lastMessageTime: msg.timestamp || msg.createdAt,
          unreadCount: 0
        });
      } else {
        const existing = conversationMap.get(key);
        const existingTime = new Date(existing.lastMessageTime).getTime();
        const msgTime = new Date(msg.timestamp || msg.createdAt).getTime();
        if (msgTime > existingTime) {
          existing.lastMessage = msg.message || '';
          existing.lastMessageTime = msg.timestamp || msg.createdAt;
        }
      }
    }

    // Unread counts
    for (const [key, conv] of conversationMap.entries()) {
      conv.unreadCount = messages.filter(m => {
        const msgSenderId = (m.senderId?._id || m.senderId)?.toString();
        const msgRecipientId = (m.recipientId?._id || m.recipientId)?.toString();
        const otherId = msgSenderId === userStringId ? msgRecipientId : msgSenderId;

        return (
          m.requestId === conv.conversationId &&
          otherId === conv.userId &&
          msgSenderId !== userStringId &&
          !m.isRead
        );
      }).length;
    }

    const conversations = Array.from(conversationMap.values()).sort(
      (a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    );

    return res.json({ success: true, conversations });
  } catch (err) {
    console.error('❌ /chat/conversations ERROR:', err);
    return res.status(500).json({
      success: false,
      message: 'საუბრების ჩატვირთვა ვერ მოხერხდა',
      error: err.message
    });
  }
});

module.exports = router;