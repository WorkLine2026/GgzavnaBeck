const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const Message = require('../models/Message');
const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * GET /chat/conversations
 * დააბრუნებს მიმდინარე user-ის ყველა საუბარს (conversations)
 */
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    console.log('\n====== /chat/conversations ======');
    
    const rawUserId = req.userId;
    console.log('👤 Current req.userId:', rawUserId);

    if (!rawUserId) {
      return res.status(400).json({
        success: false,
        message: 'Missing User ID'
      });
    }

    const userStringId = rawUserId.toString();
    const isValidObjectId = mongoose.Types.ObjectId.isValid(userStringId);
    const userObjectId = isValidObjectId ? new mongoose.Types.ObjectId(userStringId) : null;

    // ✅ ძებნა: მოვძებნოთ ყველა მესიჯი, სადაც მომხმარებელი არის sender, recipient, ანrequestId ემთხვევა
    const searchConditions = [
      { senderId: userStringId },
      { recipientId: userStringId }
    ];

    if (userObjectId) {
      searchConditions.push({ senderId: userObjectId });
      searchConditions.push({ recipientId: userObjectId });
    }

    // 1. ჯერ ვეძებთ მესიჯებს, სადაც პირდაპირ ფიგურირებს ეს user
    let messages = await Message.find({ $or: searchConditions })
      .populate('senderId', 'firstName lastName')
      .populate('recipientId', 'firstName lastName')
      .sort({ timestamp: -1 })
      .lean();

    // 2. თუ ვერ იპოვა (მაგალითად recipientId null-ია), ამოვიღოთ ყველა მესიჯი, რომrequestId-ით მაინც დავაჯგუფოთ
    if (messages.length === 0) {
      console.log('⚠️ პირდაპირი ID-ით ვერ მოიძებნა, მიმდინარეობს requestId-ით ძებნა...');
      messages = await Message.find({})
        .populate('senderId', 'firstName lastName')
        .populate('recipientId', 'firstName lastName')
        .sort({ timestamp: -1 })
        .lean();
    }

    console.log('📊 სულ დამუშავებული მესიჯი:', messages.length);

    if (messages.length === 0) {
      return res.json({
        success: true,
        message: 'მოხმარებელს მესიჯი ვერ მოიძებნა',
        conversations: []
      });
    }

    const conversationMap = new Map();

    for (const msg of messages) {
      if (!msg.requestId) continue;

      const msgSenderId = msg.senderId?._id?.toString() || msg.senderId?.toString();
      const msgRecipientId = msg.recipientId?._id?.toString() || msg.recipientId?.toString();

      // თუ მესიჯი არც ამ იუზერის გაგზავნილია და არც მისთვისაა განკუთვნილი (და recipientId null არ არის), გამოვტოვოთ
      if (msgSenderId !== userStringId && msgRecipientId && msgRecipientId !== userStringId) {
        continue;
      }

      const isSender = msgSenderId === userStringId;
      let otherUserId = isSender ? msgRecipientId : msgSenderId;

      // თუ recipientId null იყო, მეორე მხარედ ავიღოთ გამგზავნი
      if (!otherUserId || otherUserId === 'null') {
        otherUserId = msgSenderId !== userStringId ? msgSenderId : 'unknown';
      }

      const key = `${msg.requestId}`;

      if (!conversationMap.has(key)) {
        let otherUserName = 'უცნობი მომხმარებელი';
        const otherUserObj = isSender ? msg.recipientId : msg.senderId;

        if (otherUserObj && typeof otherUserObj === 'object') {
          const fn = otherUserObj.firstName || '';
          const ln = otherUserObj.lastName || '';
          const fullName = `${fn} ${ln}`.trim();
          if (fullName) otherUserName = fullName;
        } else if (msg.senderName && !isSender) {
          otherUserName = msg.senderName;
        } else if (msg.recipientName && isSender) {
          otherUserName = msg.recipientName;
        }

        conversationMap.set(key, {
          conversationId: msg.requestId,
          userId: otherUserId,
          userName: otherUserName,
          lastMessage: msg.message || msg.text || '',
          lastMessageTime: msg.timestamp || msg.createdAt,
          unreadCount: 0
        });
      }
    }

    // ✅ წაუკითხავების დათვლა
    for (const [key, conv] of conversationMap.entries()) {
      const unreadCount = messages.filter(m => {
        const msgSenderId = m.senderId?._id?.toString() || m.senderId?.toString();
        return m.requestId === conv.conversationId && msgSenderId !== userStringId && !m.isRead;
      }).length;

      conv.unreadCount = unreadCount;
    }

    const conversations = Array.from(conversationMap.values()).sort(
      (a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    );

    console.log('✅ დასრულებული საუბრები:', conversations.length);

    return res.json({
      success: true,
      message: 'საუბრები დაიტვირთა',
      conversations
    });

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