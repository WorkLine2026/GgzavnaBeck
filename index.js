require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Routes
const authRoutes = require('./routes/auth.routes');
const parcelRoutes = require('./routes/parcel.routes');

const app = express();

// ✅ ნებადართული origin-ების სია
const allowedOrigins = [
  'http://localhost:4200',
  'https://gadazidva.vercel.app',
  'https://ggzavna-frontend.vercel.app' 
];

// ✅ უსაფრთხო და მარტივი CORS კონფიგურაცია
app.use(cors({
  origin: function (origin, callback) {
    // უშვებს მოთხოვნებს origin-ის გარეშე (Postman, Mobile apps)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      // Error-ის სროლის ნაცვლად გავატანოთ false
      return callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/parcels', parcelRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected...'))
  .catch(err => console.log('❌ MongoDB Error:', err));

// ✅ PORT binding - 0.0.0.0 აუცილებელია Render-ზე
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});