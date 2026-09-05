// utils/checkSmsBalance.js
const axios = require('axios');

async function checkBalance() {
  const response = await axios.get('http://smsoffice.ge/api/getBalance', {
    params: { key: process.env.SMS_OFFICE_KEY }
  });
  console.log('SMS Balance:', response.data);
  return response.data;
}

module.exports = { checkBalance };