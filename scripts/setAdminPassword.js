require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password || password.length < 8) {
    console.log('გამოყენება: node scripts/setAdminPassword.js email@example.com პაროლი(მინ. 8)');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const hash = await bcrypt.hash(password, 12);
  const u = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { adminPasswordHash: hash, role: 'admin' },
    { new: true }
  );
  console.log(u ? `✅ ადმინი დაყენებულია: ${u.email}` : '❌ მომხმარებელი ვერ მოიძებნა');
  process.exit(0);
})();