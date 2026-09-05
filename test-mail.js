require('dotenv').config();
const { sendProblemMail } = require('./services/mail.service');

sendProblemMail('ეს არის სატესტო შეტყობინება')
  .then(() => console.log('✅ მეილი წარმატებით გაიგზავნა'))
  .catch((err) => console.error('❌ შეცდომა:', err.message));