require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

// Routes
const authRoutes = require('./routes/auth.routes');
const parcelRoutes = require('./routes/parcel.routes');
const chatRoutes = require('./routes/chat.routes');

// Models
const Message = require('./models/Message');

const app = express();

const allowedOrigins = [
  'http://localhost:4200',
  'https://gadazidva.vercel.app',
  'https://ggzavna-frontend.vercel.app'
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

app.use('/api/auth', authRoutes);
app.use('/api/parcels', parcelRoutes);
app.use('/api/chat', chatRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
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

function roomKey(requestId) {
  return `request:${requestId}`;
}

function userRoomKey(userId) {
  return `user:${userId}`;
}

// ✅ გაუმჯობესებული normalizeMessage - იღებს recipientId-ს ავტომატურად, თუ ფრონტიდან არ მოვიდა
async function normalizeMessage(data, socket) {
  const senderId = data.senderId || socket.userId;
  let recipientId = data.recipientId || data.receiverId || data.to;

  // 💡 თუ recipientId მაინც null-ია, ვცდილობთ ბაზის წინა მესიჯებიდან ამოღებას
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

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const userId = socket.handshake.auth?.userId;

  if (!token && !userId) {
    return next(new Error('Authentication error'));
  }

  socket.userId = userId || 'unknown';
  return next();
});

io.on('connection', (socket) => {
  const userId = socket.userId;

  if (userId && userId !== 'unknown') {
    onlineUsers.set(userId, socket.id);
    socket.join(userRoomKey(userId));
  }

  socket.on('join_room', async ({ requestId }) => {
    if (!requestId) return;

    const room = roomKey(requestId);
    socket.join(room);

    if (!rooms.has(room)) rooms.set(room, new Set());
    rooms.get(room).add(socket.id);

    try {
      const history = await Message.find({ requestId }).sort({ timestamp: 1 });
      socket.emit('messages_history', history);
    } catch (err) {
      console.error('❌ history შეცდომა:', err);
      socket.emit('messages_history', []);
    }
  });

  socket.on('load_messages', async ({ requestId }) => {
    if (!requestId) return;

    try {
      const history = await Message.find({ requestId }).sort({ timestamp: 1 });
      socket.emit('messages_history', history);
    } catch (err) {
      console.error('❌ history შეცდომა:', err);
      socket.emit('messages_history', []);
    }
  });

  socket.on('send_message', async (data) => {
    if (!data?.requestId) return;

    const room = roomKey(data.requestId);
    const normalized = await normalizeMessage(data, socket);

    let saved;
    try {
      saved = await Message.create(normalized);
      console.log('✅ მესიჯი წარმატებით შენახულია ბაზაში:', saved._id);
    } catch (err) {
      console.error('❌ შეტყობინების შენახვის შეცდომა:', err);
      return;
    }

    const message = saved.toObject();

    // ოთახში გაგზავნა
    io.to(room).emit('message', message);
    io.to(room).emit('receive_message', message);

    // პერსონალურ ოთახებში გაგზავნა
    const senderIdStr = message.senderId?.toString();
    const recipientIdStr = message.recipientId?.toString();

    if (senderIdStr) {
      io.to(userRoomKey(senderIdStr)).emit('message', message);
    }
    if (recipientIdStr) {
      io.to(userRoomKey(recipientIdStr)).emit('message', message);

      const recipientSocketId = onlineUsers.get(recipientIdStr);
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

        io.to(roomKey(msg.requestId)).emit('message_read', messageId);
        if (senderIdStr) io.to(userRoomKey(senderIdStr)).emit('message_read', messageId);
        if (recipientIdStr) io.to(userRoomKey(recipientIdStr)).emit('message_read', messageId);
      }
    } catch (err) {
      console.error('❌ mark_as_read შეცდომა:', err);
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