require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

// Routes
const authRoutes = require('./routes/auth.routes');
const parcelRoutes = require('./routes/parcel.routes');
const chatRoutes = require('./routes/chat.routes');
const adminRoutes = require('./routes/admin.routes');
// Models
const Message = require('./models/Message');


const app = express();

const allowedOrigins = [
  'http://localhost:4200',
  'https://gadazidva.vercel.app',
  'https://ggzavna-frontend.vercel.app',
  'https://localhost',        // Capacitor Android WebView
  'capacitor://localhost'     // Capacitor iOS WebView
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ℹ️ შენიშვნა: ფოტოები ახლა Cloudinary-ზე ინახება (არა ლოკალურ დისკზე),
// ამიტომ '/uploads' static route საჭირო აღარ არის.

app.use('/api/auth', authRoutes);
app.use('/api/parcels', parcelRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// ✅ multer-ის (ფაილის ატვირთვის) შეცდომების დამჭერი middleware
app.use((err, req, res, next) => {
  if (err && (err.name === 'MulterError' || err.message)) {
    console.error('❌ Upload error:', err.message);
    return res.status(400).json({
      success: false,
      message: err.message || 'ფაილის ატვირთვა ვერ მოხერხდა'
    });
  }
  next(err);
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected...'))
  .catch(err => console.log('❌ MongoDB Error:', err));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }
});

const onlineUsers = new Map();
const rooms = new Map();

/**
 * ✅ ოთახის გასაღები requestId + ორივე მონაწილის (sorted) id-ით
 */
function roomKey(requestId, userA, userB) {
  const ids = [userA, userB]
    .filter(Boolean)
    .map(String)
    .sort();
  return `request:${requestId}:${ids.join(':')}`;
}

function userRoomKey(userId) {
  return `user:${userId}`;
}

async function normalizeMessage(data, socket) {
  const senderId = data.senderId || socket.userId;
  let recipientId = data.recipientId || data.receiverId || data.to;

  if (!recipientId && data.requestId) {
    try {
      const prevMsg = await Message.findOne({
        requestId: data.requestId,
        senderId: { $ne: senderId }
      }).sort({ _id: -1 });

      if (prevMsg) {
        recipientId = prevMsg.senderId;
      }
    } catch (e) {
      console.error('❌ Error finding recipientId from history:', e);
    }
  }

  return {
    requestId: data.requestId,
    senderId: (senderId && mongoose.Types.ObjectId.isValid(senderId))
      ? new mongoose.Types.ObjectId(senderId)
      : senderId,
    senderName: data.senderName || 'Unknown',
    recipientId: (recipientId && mongoose.Types.ObjectId.isValid(recipientId))
      ? new mongoose.Types.ObjectId(recipientId)
      : recipientId || null,
    message: data.message || data.text || '',
    timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    isRead: false
  };
}

/**
 * ✅ აბრუნებს ისტორიას მხოლოდ ორ კონკრეტულ მონაწილეს შორის.
 * თუ ID არავალიდურია (ObjectId ფორმატით), query საერთოდ არ
 * გაეშვება — ცარიელი მასივი დაბრუნდება (crash-ის ნაცვლად).
 */
async function fetchPairHistory(requestId, currentUserId, otherUserId) {
  const isValidId = (id) => id && mongoose.Types.ObjectId.isValid(id);

  const query = { requestId };

  if (isValidId(currentUserId) && isValidId(otherUserId)) {
    query.$or = [
      { senderId: currentUserId, recipientId: otherUserId },
      { senderId: otherUserId, recipientId: currentUserId }
    ];
  } else if (isValidId(currentUserId)) {
    query.$or = [
      { senderId: currentUserId },
      { recipientId: currentUserId }
    ];
  } else {
    console.warn('⚠️ fetchPairHistory: არავალიდური currentUserId:', currentUserId);
    return [];
  }

  console.log('🔍 fetchPairHistory query:', JSON.stringify(query));
  const result = await Message.find(query).sort({ timestamp: 1 });
  console.log('🔍 fetchPairHistory ნაპოვნია:', result.length, 'მესიჯი');
  return result;
}

/**
 * ✅ Socket.io ავთენტიფიკაცია — იგივე ლოგიკა, რაც
 * middleware/auth.middleware.js-შია REST-ისთვის.
 */
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    console.warn('⚠️ Socket auth: token არ მოვიდა');
    return next(new Error('Authentication error: token required'));
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    );

    if (!decoded.userId) {
      return next(new Error('Authentication error: userId not found in token'));
    }

    socket.userId = decoded.userId.toString();
    socket.userEmail = decoded.email;
    console.log('✅ Socket auth წარმატებული, userId:', socket.userId);
    return next();
  } catch (err) {
    console.error('❌ Socket auth error:', err.message);
    return next(new Error('Authentication error: invalid or expired token'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.userId;

  if (userId) {
    onlineUsers.set(userId, socket.id);
    socket.join(userRoomKey(userId));
    console.log('🟢 User დაკავშირდა:', userId);
  }

  socket.on('join_room', async ({ requestId, otherUserId }) => {
    if (!requestId) return;
    console.log('🚪 join_room მოვიდა:', { requestId, otherUserId, currentUserId: socket.userId });

    const currentUserId = socket.userId;
    const room = roomKey(requestId, currentUserId, otherUserId);
    socket.join(room);

    if (!rooms.has(room)) rooms.set(room, new Set());
    rooms.get(room).add(socket.id);

    try {
      const history = await fetchPairHistory(requestId, currentUserId, otherUserId);
      console.log('📜 join_room history რაოდენობა:', history.length);
      socket.emit('messages_history', history);
    } catch (err) {
      console.error('❌ history შეცდომა:', err);
      socket.emit('messages_history', []);
    }
  });

  socket.on('load_messages', async ({ requestId, otherUserId }) => {
    if (!requestId) return;
    console.log('📜 load_messages მოვიდა:', { requestId, otherUserId, currentUserId: socket.userId });

    try {
      const history = await fetchPairHistory(requestId, socket.userId, otherUserId);
      console.log('📜 load_messages history რაოდენობა:', history.length);
      socket.emit('messages_history', history);
    } catch (err) {
      console.error('❌ history შეცდომა:', err);
      socket.emit('messages_history', []);
    }
  });

  socket.on('send_message', async (data) => {
    if (!data?.requestId) return;

    const normalized = await normalizeMessage(data, socket);

    // 🚫 საკუთარ თავზე შეტყობინების გაგზავნის დაბლოკვა
    const senderIdStr = normalized.senderId?.toString();
    const recipientIdStr = normalized.recipientId?.toString();

    if (senderIdStr && recipientIdStr && senderIdStr === recipientIdStr) {
      console.warn('⛔ საკუთარ თავზე შეტყობინების მცდელობა დაბლოკილია:', senderIdStr);
      socket.emit('message_error', {
        message: 'საკუთარ განცხადებაზე შეტყობინების გაგზავნა შეუძლებელია'
      });
      return;
    }

    let saved;
    try {
      saved = await Message.create(normalized);
      console.log('✅ მესიჯი წარმატებით შენახულია ბაზაში:', saved._id);
    } catch (err) {
      console.error('❌ შეტყობინების შენახვის შეცდომა:', err);
      return;
    }

    const message = saved.toObject();

    const savedSenderIdStr = message.senderId?.toString();
    const savedRecipientIdStr = message.recipientId?.toString();

    const room = roomKey(message.requestId, savedSenderIdStr, savedRecipientIdStr);
    io.to(room).emit('message', message);
    io.to(room).emit('receive_message', message);

    if (savedSenderIdStr) {
      io.to(userRoomKey(savedSenderIdStr)).emit('message', message);
    }
    if (savedRecipientIdStr) {
      io.to(userRoomKey(savedRecipientIdStr)).emit('message', message);

      const recipientSocketId = onlineUsers.get(savedRecipientIdStr);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('notification', {
          type: 'message',
          title: 'New message',
          body: message.message,
          requestId: message.requestId,
          data: message
        });
      }
    }
  });

  socket.on('mark_as_read', async ({ messageId }) => {
    if (!messageId) return;

    try {
      const msg = await Message.findByIdAndUpdate(
        messageId,
        { isRead: true },
        { new: true }
      );

      if (msg) {
        const senderIdStr = msg.senderId?.toString();
        const recipientIdStr = msg.recipientId?.toString();
        const room = roomKey(msg.requestId, senderIdStr, recipientIdStr);

        io.to(room).emit('message_read', messageId);
        if (senderIdStr) io.to(userRoomKey(senderIdStr)).emit('message_read', messageId);
        if (recipientIdStr) io.to(userRoomKey(recipientIdStr)).emit('message_read', messageId);
      }
    } catch (err) {
      console.error('❌ mark_as_read შეცდომა:', err);
    }
  });

  // ✅ NEW: ცალკეული შეტყობინების წაშლა
  // მხოლოდ სენდერს შეუძლია საკუთარი მესიჯის წაშლა.
  // შლის რეალურად ბაზიდან და აცნობებს ორივე მხარეს (room + user rooms),
  // რომ UI-დან ორივესთვის ერთდროულად გაქრეს (realtime).
  socket.on('delete_message', async ({ messageId }) => {
    if (!messageId) return;

    try {
      const msg = await Message.findById(messageId);

      if (!msg) {
        socket.emit('message_error', { message: 'შეტყობინება ვერ მოიძებნა' });
        return;
      }

      const senderIdStr = msg.senderId?.toString();

      if (senderIdStr !== socket.userId) {
        console.warn('⛔ წაშლის მცდელობა სხვის მესიჯზე დაბლოკილია:', {
          messageOwner: senderIdStr,
          requester: socket.userId
        });
        socket.emit('message_error', {
          message: 'შეგიძლიათ მხოლოდ თქვენი შეტყობინებების წაშლა'
        });
        return;
      }

      const recipientIdStr = msg.recipientId?.toString();
      const requestId = msg.requestId;

      await Message.findByIdAndDelete(messageId);
      console.log('🗑️ მესიჯი წაშლილია:', messageId);

      const room = roomKey(requestId, senderIdStr, recipientIdStr);
      const payload = { messageId, requestId, senderId: senderIdStr, recipientId: recipientIdStr };

      io.to(room).emit('message_deleted', payload);
      if (senderIdStr) io.to(userRoomKey(senderIdStr)).emit('message_deleted', payload);
      if (recipientIdStr) io.to(userRoomKey(recipientIdStr)).emit('message_deleted', payload);
    } catch (err) {
      console.error('❌ delete_message შეცდომა:', err);
      socket.emit('message_error', { message: 'შეტყობინების წაშლა ვერ მოხერხდა' });
    }
  });

  socket.on('send_notification', ({ recipientId, ...data }) => {
    if (!recipientId) return;

    const recipientSocketId = onlineUsers.get(recipientId);
    if (!recipientSocketId) return;

    io.to(recipientSocketId).emit('notification', data);
  });

  socket.on('disconnect', () => {
    for (const [uid, sid] of onlineUsers.entries()) {
      if (sid === socket.id) {
        onlineUsers.delete(uid);
        break;
      }
    }

    for (const [room, sockets] of rooms.entries()) {
      sockets.delete(socket.id);
      if (sockets.size === 0) rooms.delete(room);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});