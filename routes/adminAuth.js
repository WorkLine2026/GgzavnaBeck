const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// brute-force დაცვა: IP-ზე 10 მცდელობა / 15 წთ
const attempts = new Map();
const WINDOW = 15 * 60 * 1000;
const MAX = 10;

function limited(ip) {
  const now = Date.now();
  const rec = (attempts.get(ip) || []).filter((t) => now - t < WINDOW);
  attempts.set(ip, rec);
  return rec.length >= MAX;
}

function hit(ip) {
  const rec = attempts.get(ip) || [];
  rec.push(Date.now());
  attempts.set(ip, rec);
}

router.post('/login', async (req, res) => {
  try {
    const ip = req.ip;
    if (limited(ip)) {
      return res.status(429).json({ success: false, message: 'ძალიან ბევრი მცდელობა. სცადე მოგვიანებით' });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'შეიყვანე ელფოსტა და პაროლი' });
    }

    const user = await User.findOne({ email }).select('+adminPasswordHash');
    const ok =
      user &&
      user.role === 'admin' &&
      user.adminPasswordHash &&
      (await bcrypt.compare(password, user.adminPasswordHash));

    if (!ok) {
      hit(ip);
      return res.status(401).json({ success: false, message: 'ელფოსტა ან პაროლი არასწორია' });
    }
    if (user.isBanned) {
      return res.status(403).json({ success: false, message: 'ანგარიში დაბლოკილია' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: { _id: user._id, firstName: user.firstName, lastName: user.lastName, role: user.role }
    });
  } catch (e) {
    console.error('admin login error:', e);
    res.status(500).json({ success: false, message: 'სერვერის შეცდომა' });
  }
});

module.exports = router;