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

    console.log('📊 სულ დამუშავებული მესიჯი:', messages.length);

    if (messages.length === 0) {
      return res.json({
        success: true,
        message: 'მოხმარებელს მესიჯი ვერ მოიძებნა',
        conversations: []
      });
    }

    const conversationMap = new Map();

    // 🔎 დეტალური ანალიზი — დროებითი debug ლოგები
    console.log('\n🔎 === მესიჯების დეტალური ანალიზი ===');
    for (const msg of messages) {
      if (!msg.requestId) continue;

      const msgSenderId = msg.senderId?._id?.toString() || msg.senderId?.toString();
      const msgRecipientId = msg.recipientId?._id?.toString() || msg.recipientId?.toString();

      console.log(`📨 msg[${msg._id}] requestId=${msg.requestId} sender=${msgSenderId} recipient=${msgRecipientId} text="${(msg.message || '').slice(0, 20)}"`);

      if (msgSenderId !== userStringId && msgRecipientId && msgRecipientId !== userStringId) {
        console.log('   ⏭️ გამოტოვებულია (არც სენდერი, არც რეციპიენტი არ ვართ)');
        continue;
      }

      const isSender = msgSenderId === userStringId;
      let otherUserId = isSender ? msgRecipientId : msgSenderId;

      if (!otherUserId || otherUserId === 'null') {
        otherUserId = msgSenderId !== userStringId ? msgSenderId : 'unknown';
      }

      const key = `${msg.requestId}:${otherUserId}`;
      console.log(`   ➡️ isSender=${isSender} otherUserId=${otherUserId} KEY=${key}`);

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
      } else {
        const existing = conversationMap.get(key);
        const existingTime = new Date(existing.lastMessageTime).getTime();
        const msgTime = new Date(msg.timestamp || msg.createdAt).getTime();
        if (msgTime > existingTime) {
          existing.lastMessage = msg.message || msg.text || '';
          existing.lastMessageTime = msg.timestamp || msg.createdAt;
        }
      }
    }
    console.log('🔎 === საბოლოო conversationMap keys:', Array.from(conversationMap.keys()), '===\n');

    for (const [key, conv] of conversationMap.entries()) {
      const unreadCount = messages.filter(m => {
        const msgSenderId = m.senderId?._id?.toString() || m.senderId?.toString();
        const msgRecipientId = m.recipientId?._id?.toString() || m.recipientId?.toString();
        const otherIdForThisMsg = msgSenderId === userStringId ? msgRecipientId : msgSenderId;

        return (
          m.requestId === conv.conversationId &&
          otherIdForThisMsg === conv.userId &&
          msgSenderId !== userStringId &&
          !m.isRead
        );
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