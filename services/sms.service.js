const axios = require('axios');

async function sendSMS({ phone, content, reference }) {
  const payload = {
    key: process.env.SMS_OFFICE_KEY,
    destination: phone,
    sender: process.env.SMS_SENDER,
    content,
    urgent: 'true',
    reference
  };

  const url = 'https://smsoffice.ge/api/v2/send/';

  console.log('--- SMS SEND REQUEST ---');
  console.log('Phone:', phone);
  console.log('Reference:', reference);
  console.log('Sender:', process.env.SMS_SENDER);
  console.log('Content:', content);
  console.log('URL:', url);
  console.log('Payload:', {
    ...payload,
    key: payload.key ? '***HIDDEN***' : undefined
  });

  try {
    const response = await axios.get(url, {
      params: payload,
      timeout: 10000
    });

    console.log('--- SMS SEND RESPONSE ---');
    console.log('HTTP Status:', response.status);
    console.log('Response Data:', response.data);

    return response.data;
  } catch (error) {
    console.log('--- SMS SEND ERROR ---');

    if (error.response) {
      console.log('HTTP Status:', error.response.status);
      console.log('Error Data:', error.response.data);
      console.log('Error Headers:', error.response.headers);
    } else if (error.request) {
      console.log('No response received.');
      console.log('Request Object:', error.request);
    } else {
      console.log('Error Message:', error.message);
    }

    console.log('Full Error:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    throw error;
  }
}

module.exports = { sendSMS };