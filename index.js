require('dotenv').config({ quiet: true });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

const { verifyToken } = require('./utils/jwt.utils');
const connectDB = require('./config/db');

// Routes
const authRoutes = require('./routes/auth.routes');
const parcelRoutes = require('./routes/parcel.routes');
const chatRoutes = require('./routes/chat.routes');
const adminRoutes = require('./routes/admin.routes');
const supportRoutes = require('./routes/support.routes'); // ← ახალი
const notificationRoutes = require('./routes/notification.routes'); // ← ახალი, სხვა route-ებთან ერთად

// Models
const Message = require('./models/Message');

// ============================================================
// ENVIRONMENT
// ============================================================

const REQUIRED_ENV_VARS = ['JWT_SECRET', 'MONGO_URI'];

const missingEnvVars = REQUIRED_ENV_VARS.filter(
  key => !process.env[key]
);

if (missingEnvVars.length > 0) {
  console.error(
    `❌ სერვერი ვერ გაეშვება — გარემოს ცვლადები არ არის დაყენებული: ${missingEnvVars.join(', ')}`
  );

  process.exit(1);
}

// ============================================================
// EXPRESS
// ============================================================

const app = express();

const allowedOrigins = [
  'http://localhost:4200',
  'https://gadazidva.vercel.app',
  'https://ggzavna-frontend.vercel.app',
  'https://localhost',
  'capacitor://localhost'
];

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(helmet());

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },

    credentials: true,

    methods: [
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'OPTIONS'
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization'
    ]
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// ROUTES
// ============================================================

app.use('/api/auth', authRoutes);
app.use('/api/parcels', parcelRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/notifications', notificationRoutes); // ← ახალი // ← ახალი

// ============================================================
// HEALTH
// ============================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server is running'
  });
});

// ============================================================
// 404
// ============================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'გვერდი ვერ მოიძებნა'
  });
});

// ============================================================
// MULTER ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    console.error('❌ Upload error:', err.message);

    return res.status(400).json({
      success: false,
      message: err.message || 'ფაილის ატვირთვა ვერ მოხერხდა'
    });
  }

  next(err);
});

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'სერვერის შიდა შეცდომა'
  });
});

// ============================================================
// HTTP SERVER
// ============================================================

const server = http.createServer(app);

// ============================================================
// SOCKET.IO
// ============================================================

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,

    methods: [
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'OPTIONS'
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization'
    ]
  },

  transports: [
    'websocket',
    'polling'
  ],

  pingTimeout: 60000,
  pingInterval: 25000
});

app.set('io', io);

// ============================================================
// ONLINE USERS
// ============================================================

const onlineUsers = new Map();

function normalizeId(id) {
  if (!id) {
    return '';
  }

  if (
    typeof id === 'object' &&
    id._id
  ) {
    return String(id._id);
  }

  return String(id);
}

function userRoomKey(userId) {
  return `user:${normalizeId(userId)}`;
}

function isValidObjectId(id) {
  return (
    !!id &&
    mongoose.Types.ObjectId.isValid(
      String(id)
    )
  );
}

function isUserOnline(userId) {
  const id = normalizeId(userId);

  const sockets = onlineUsers.get(id);

  return !!sockets && sockets.size > 0;
}

function addOnlineUser(userId, socketId) {
  const id = normalizeId(userId);

  if (!id) {
    return false;
  }

  if (!onlineUsers.has(id)) {
    onlineUsers.set(
      id,
      new Set()
    );
  }

  const sockets = onlineUsers.get(id);

  const wasOffline = sockets.size === 0;

  sockets.add(socketId);

  return wasOffline;
}

function removeOnlineUser(userId, socketId) {
  const id = normalizeId(userId);

  const sockets = onlineUsers.get(id);

  if (!sockets) {
    return false;
  }

  sockets.delete(socketId);

  if (sockets.size === 0) {
    onlineUsers.delete(id);

    return true;
  }

  return false;
}

// ============================================================
// MESSAGE NORMALIZATION
// ============================================================

async function normalizeMessage(data, socket) {
  // senderId-ს frontend-ს არ ვენდობით.
  // sender ყოველთვის authenticated socket.userId არის.

  const senderId = normalizeId(
    socket.userId
  );

  if (!senderId) {
    throw new Error(
      'Authenticated user ID missing'
    );
  }

  let recipientId = normalizeId(
    data?.recipientId ||
    data?.receiverId ||
    data?.to
  );

  // ==========================================================
  // FALLBACK RECIPIENT
  // ==========================================================

  if (
    !recipientId &&
    data?.requestId
  ) {
    const previousMessage =
      await Message.findOne({
        requestId: String(data.requestId),

        $or: [
          {
            senderId
          },

          {
            recipientId: senderId
          }
        ]
      })
        .sort({
          timestamp: -1
        })
        .lean();

    if (previousMessage) {
      const previousSender =
        normalizeId(
          previousMessage.senderId
        );

      const previousRecipient =
        normalizeId(
          previousMessage.recipientId
        );

      if (
        previousSender &&
        previousSender !== senderId
      ) {
        recipientId =
          previousSender;
      } else if (
        previousRecipient &&
        previousRecipient !== senderId
      ) {
        recipientId =
          previousRecipient;
      }
    }
  }

  if (!recipientId) {
    throw new Error(
      'recipientId აუცილებელია'
    );
  }

  if (
    senderId === recipientId
  ) {
    throw new Error(
      'საკუთარ თავთან შეტყობინების გაგზავნა შეუძლებელია'
    );
  }

  const messageText = String(
    data?.message ||
    data?.text ||
    ''
  ).trim();

  if (!messageText) {
    throw new Error(
      'ცარიელი შეტყობინება'
    );
  }

  return {
    requestId: String(
      data.requestId
    ),

    senderId:
      isValidObjectId(senderId)
        ? new mongoose.Types.ObjectId(
            senderId
          )
        : senderId,

    senderName: String(
      data.senderName ||
      'მომხმარებელი'
    ),

    recipientId:
      isValidObjectId(recipientId)
        ? new mongoose.Types.ObjectId(
            recipientId
          )
        : recipientId,

    message:
      messageText,

    timestamp:
      data.timestamp
        ? new Date(
            data.timestamp
          )
        : new Date(),

    isRead: false
  };
}

// ============================================================
// FETCH CHAT HISTORY
// ============================================================

async function fetchPairHistory(
  requestId,
  currentUserId,
  otherUserId
) {
  const currentId =
    normalizeId(
      currentUserId
    );

  const otherId =
    normalizeId(
      otherUserId
    );

  if (!requestId || !currentId) {
    return [];
  }

  const query = {
    requestId: String(requestId)
  };

  if (otherId) {
    query.$or = [
      {
        senderId: currentId,
        recipientId: otherId
      },

      {
        senderId: otherId,
        recipientId: currentId
      }
    ];
  } else {
    query.$or = [
      {
        senderId: currentId
      },

      {
        recipientId: currentId
      }
    ];
  }

  const messages =
    await Message.find(query)
      .sort({
        timestamp: 1
      })
      .lean();

  return messages.map(
    message => ({
      ...message,

      _id: message._id
        ? String(message._id)
        : undefined,

      senderId:
        normalizeId(
          message.senderId
        ),

      recipientId:
        message.recipientId
          ? normalizeId(
              message.recipientId
            )
          : undefined,

      requestId: String(
        message.requestId
      ),

      timestamp:
        message.timestamp ||
        message.createdAt
    })
  );
}

// ============================================================
// SEND HISTORY
// ============================================================

async function sendHistory(
  socket,
  requestId,
  otherUserId
) {
  if (!requestId) {
    socket.emit(
      'messages_history',
      []
    );

    return;
  }

  try {
    const history =
      await fetchPairHistory(
        requestId,
        socket.userId,
        otherUserId
      );

    console.log(
      `📥 History: user=${socket.userId}, request=${requestId}, other=${otherUserId}, count=${history.length}`
    );

    socket.emit(
      'messages_history',
      history
    );
  } catch (error) {
    console.error(
      '❌ sendHistory:',
      error
    );

    socket.emit(
      'messages_history',
      []
    );
  }
}

// ============================================================
// SOCKET AUTH
// ============================================================

io.use(
  (socket, next) => {
    const token =
      socket.handshake.auth?.token;

    if (!token) {
      return next(
        new Error(
          'Authentication error: token required'
        )
      );
    }

    try {
      const decoded =
        verifyToken(token);

      if (!decoded?.userId) {
        return next(
          new Error(
            'Authentication error: userId missing'
          )
        );
      }

      socket.userId =
        normalizeId(
          decoded.userId
        );

      socket.userEmail =
        decoded.email || '';

      console.log(
        `🔐 Socket authenticated: ${socket.userId}`
      );

      next();
    } catch (error) {
      console.error(
        '❌ Socket auth:',
        error.message
      );

      next(
        new Error(
          'Authentication error: invalid or expired token'
        )
      );
    }
  }
);

// ============================================================
// CONNECTION
// ============================================================

io.on(
  'connection',
  socket => {
    const userId =
      normalizeId(
        socket.userId
      );

    if (!userId) {
      socket.disconnect(true);
      return;
    }

    console.log(
      `🟢 Socket connected: user=${userId}, socket=${socket.id}`
    );

    // ========================================================
    // ONLINE
    // ========================================================

    const becameOnline =
      addOnlineUser(
        userId,
        socket.id
      );

    socket.join(
      userRoomKey(userId)
    );

    if (becameOnline) {
      io.emit(
        'user_status',
        {
          userId,
          isOnline: true
        }
      );
    }

    // ========================================================
    // ONLINE STATUS
    // ========================================================

    socket.on(
      'get_online_status',
      (
        userIds,
        callback
      ) => {
        if (
          typeof callback !==
          'function'
        ) {
          return;
        }

        if (
          !Array.isArray(userIds)
        ) {
          callback([]);
          return;
        }

        const onlineIds =
          userIds
            .map(
              id =>
                normalizeId(id)
            )
            .filter(
              id =>
                id &&
                isUserOnline(id)
            );

        callback(
          onlineIds
        );
      }
    );

    // ========================================================
    // JOIN CHAT
    // ========================================================

    socket.on(
      'join_room',
      async payload => {
        try {
          const requestId =
            String(
              payload?.requestId ||
              ''
            );

          const otherUserId =
            normalizeId(
              payload?.otherUserId
            );

          if (!requestId) {
            return;
          }

          const roomName =
            `chat:${requestId}:${[
              userId,
              otherUserId
            ]
              .filter(Boolean)
              .sort()
              .join(':')}`;

          await socket.join(
            roomName
          );

          socket.activeChat = {
            requestId,
            otherUserId,
            roomName
          };

          console.log(
            `🚪 Joined: ${roomName}`
          );

          await sendHistory(
            socket,
            requestId,
            otherUserId
          );
        } catch (error) {
          console.error(
            '❌ join_room:',
            error
          );
        }
      }
    );

    // ========================================================
    // LOAD MESSAGES
    // ========================================================

    socket.on(
      'load_messages',
      async payload => {
        try {
          const requestId =
            String(
              payload?.requestId ||
              ''
            );

          const otherUserId =
            normalizeId(
              payload?.otherUserId
            );

          await sendHistory(
            socket,
            requestId,
            otherUserId
          );
        } catch (error) {
          console.error(
            '❌ load_messages:',
            error
          );

          socket.emit(
            'messages_history',
            []
          );
        }
      }
    );

    // ========================================================
    // SEND MESSAGE
    // ========================================================

    socket.on(
      'send_message',
      async (
        data,
        callback
      ) => {
        const ack =
          typeof callback ===
          'function'
            ? callback
            : () => {};

        try {
          // --------------------------------------------------
          // VALIDATION
          // --------------------------------------------------

          if (
            !data?.requestId
          ) {
            return ack({
              success: false,
              error:
                'requestId აუცილებელია'
            });
          }

          if (
            !data?.message ||
            !String(
              data.message
            ).trim()
          ) {
            return ack({
              success: false,
              error:
                'ცარიელი შეტყობინების გაგზავნა შეუძლებელია'
            });
          }

          // --------------------------------------------------
          // NORMALIZE
          // --------------------------------------------------

          const normalized =
            await normalizeMessage(
              data,
              socket
            );

          const senderId =
            normalizeId(
              normalized.senderId
            );

          const recipientId =
            normalizeId(
              normalized.recipientId
            );

          if (!senderId) {
            return ack({
              success: false,
              error:
                'senderId ვერ განისაზღვრა'
            });
          }

          if (!recipientId) {
            return ack({
              success: false,
              error:
                'recipientId აუცილებელია'
            });
          }

          if (
            senderId ===
            recipientId
          ) {
            return ack({
              success: false,
              error:
                'საკუთარ თავთან შეტყობინების გაგზავნა შეუძლებელია'
            });
          }

          // --------------------------------------------------
          // SAVE
          // --------------------------------------------------

          const saved =
            await Message.create(
              normalized
            );

          const message =
            saved.toObject();

          // --------------------------------------------------
          // RESPONSE MESSAGE
          // --------------------------------------------------

          const responseMessage = {
            ...message,

            _id: String(
              message._id
            ),

            senderId:
              normalizeId(
                message.senderId
              ),

            recipientId:
              normalizeId(
                message.recipientId
              ),

            requestId: String(
              message.requestId
            ),

            timestamp:
              message.timestamp,

            clientId:
              data.clientId
                ? String(
                    data.clientId
                  )
                : undefined,

            status: 'sent'
          };

          console.log(
            `💾 Message saved: ${responseMessage._id}`
          );

          // --------------------------------------------------
          // ACK SENDER
          // --------------------------------------------------

          ack({
            success: true,
            message:
              responseMessage
          });

          // --------------------------------------------------
          // SENDER OTHER DEVICES
          // --------------------------------------------------

          socket
            .to(
              userRoomKey(
                senderId
              )
            )
            .emit(
              'message',
              responseMessage
            );

          // --------------------------------------------------
          // RECIPIENT
          // --------------------------------------------------

          io
            .to(
              userRoomKey(
                recipientId
              )
            )
            .emit(
              'message',
              responseMessage
            );

          // --------------------------------------------------
          // NOTIFICATION
          // --------------------------------------------------

          if (
            isUserOnline(
              recipientId
            )
          ) {
            io
              .to(
                userRoomKey(
                  recipientId
                )
              )
              .emit(
                'notification',
                {
                  type:
                    'message',

                  title:
                    'ახალი შეტყობინება',

                  body:
                    responseMessage.message,

                  requestId:
                    responseMessage.requestId,

                  data:
                    responseMessage
                }
              );
          }
        } catch (error) {
          console.error(
            '❌ send_message ERROR:',
            error
          );

          ack({
            success: false,
            error:
              error.message ||
              'შეტყობინების გაგზავნა ვერ მოხერხდა'
          });

          socket.emit(
            'message_error',
            {
              message:
                error.message ||
                'შეტყობინების გაგზავნა ვერ მოხერხდა'
            }
          );
        }
      }
    );

    // ========================================================
    // TYPING
    // ========================================================

    socket.on(
      'typing',
      payload => {
        const requestId =
          String(
            payload?.requestId ||
            ''
          );

        const recipientId =
          normalizeId(
            payload?.recipientId
          );

        if (
          !requestId ||
          !recipientId
        ) {
          return;
        }

        io
          .to(
            userRoomKey(
              recipientId
            )
          )
          .emit(
            'typing_indicator',
            {
              requestId,

              senderId:
                userId,

              isTyping:
                true
            }
          );
      }
    );

    // ========================================================
    // STOP TYPING
    // ========================================================

    socket.on(
      'stop_typing',
      payload => {
        const requestId =
          String(
            payload?.requestId ||
            ''
          );

        const recipientId =
          normalizeId(
            payload?.recipientId
          );

        if (
          !requestId ||
          !recipientId
        ) {
          return;
        }

        io
          .to(
            userRoomKey(
              recipientId
            )
          )
          .emit(
            'typing_indicator',
            {
              requestId,

              senderId:
                userId,

              isTyping:
                false
            }
          );
      }
    );

    // ========================================================
    // MARK AS READ
    // ========================================================

    socket.on(
      'mark_as_read',
      async payload => {
        const messageId =
          normalizeId(
            payload?.messageId
          );

        if (!messageId) {
          return;
        }

        try {
          const message =
            await Message.findByIdAndUpdate(
              messageId,

              {
                isRead: true
              },

              {
                new: true
              }
            );

          if (!message) {
            return;
          }

          const senderId =
            normalizeId(
              message.senderId
            );

          const recipientId =
            normalizeId(
              message.recipientId
            );

          if (senderId) {
            io
              .to(
                userRoomKey(
                  senderId
                )
              )
              .emit(
                'message_read',
                messageId
              );
          }

          if (recipientId) {
            io
              .to(
                userRoomKey(
                  recipientId
                )
              )
              .emit(
                'message_read',
                messageId
              );
          }
        } catch (error) {
          console.error(
            '❌ mark_as_read:',
            error
          );
        }
      }
    );

    // ========================================================
    // DELETE MESSAGE
    // ========================================================

    socket.on(
      'delete_message',
      async (
        payload,
        callback
      ) => {
        const ack =
          typeof callback ===
          'function'
            ? callback
            : () => {};

        const messageId =
          normalizeId(
            payload?.messageId
          );

        if (!messageId) {
          return ack({
            success: false,
            error:
              'messageId აუცილებელია'
          });
        }

        try {
          const message =
            await Message.findById(
              messageId
            );

          if (!message) {
            return ack({
              success: false,
              error:
                'შეტყობინება ვერ მოიძებნა'
            });
          }

          const senderId =
            normalizeId(
              message.senderId
            );

          // --------------------------------------------------
          // SECURITY
          // --------------------------------------------------

          if (
            senderId !==
            userId
          ) {
            return ack({
              success: false,
              error:
                'შეგიძლიათ მხოლოდ თქვენი შეტყობინებების წაშლა'
            });
          }

          const recipientId =
            normalizeId(
              message.recipientId
            );

          const requestId =
            String(
              message.requestId
            );

          await Message.findByIdAndDelete(
            messageId
          );

          const deletedPayload = {
            messageId,
            requestId,
            senderId,
            recipientId
          };

          // --------------------------------------------------
          // SENDER
          // --------------------------------------------------

          if (senderId) {
            io
              .to(
                userRoomKey(
                  senderId
                )
              )
              .emit(
                'message_deleted',
                deletedPayload
              );
          }

          // --------------------------------------------------
          // RECIPIENT
          // --------------------------------------------------

          if (recipientId) {
            io
              .to(
                userRoomKey(
                  recipientId
                )
              )
              .emit(
                'message_deleted',
                deletedPayload
              );
          }

          ack({
            success: true
          });
        } catch (error) {
          console.error(
            '❌ delete_message:',
            error
          );

          ack({
            success: false,
            error:
              'შეტყობინების წაშლა ვერ მოხერხდა'
          });
        }
      }
    );

    // ========================================================
    // SEND NOTIFICATION
    // ========================================================

    socket.on(
      'send_notification',
      payload => {
        const recipientId =
          normalizeId(
            payload?.recipientId
          );

        if (!recipientId) {
          return;
        }

        const {
          recipientId: ignored,
          ...notification
        } = payload;

        if (
          !isUserOnline(
            recipientId
          )
        ) {
          return;
        }

        io
          .to(
            userRoomKey(
              recipientId
            )
          )
          .emit(
            'notification',
            notification
          );
      }
    );

    // ========================================================
    // DISCONNECT
    // ========================================================

    socket.on(
      'disconnect',
      reason => {
        console.log(
          `🔴 Socket disconnected: user=${userId}, socket=${socket.id}, reason=${reason}`
        );

        const becameOffline =
          removeOnlineUser(
            userId,
            socket.id
          );

        if (becameOffline) {
          io.emit(
            'user_status',
            {
              userId,
              isOnline: false
            }
          );
        }
      }
    );
  }
);

// ============================================================
// START SERVER
// ============================================================

const PORT =
  process.env.PORT || 3000;

const startServer =
  async () => {
    try {
      await connectDB();

      server.listen(
        PORT,
        '0.0.0.0',
        () => {
          console.log(
            `🚀 Server is running on port ${PORT}`
          );
        }
      );
    } catch (error) {
      console.error(
        '❌ Database connection failed:',
        error.message
      );

      process.exit(1);
    }
  };

startServer();