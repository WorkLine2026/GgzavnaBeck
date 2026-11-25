const { sendProblemMail } = require('../services/mail.service');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(\+?995)?\d{9}$/;

async function reportProblem(req, res) {
  try {
    const { text, email, phone } = req.body;

    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'ტექსტი სავალდებულოა',
      });
    }

    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: 'ელ-ფოსტა არასწორია',
      });
    }

    const cleanPhone = typeof phone === 'string' ? phone.replace(/[\s\-()]/g, '') : '';
    if (!PHONE_REGEX.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: 'ტელეფონი არასწორია',
      });
    }

    await sendProblemMail({
      text: text.trim(),
      email: email.trim(),
      phone: phone.trim(),
    });

    return res.status(200).json({
      success: true,
      message: 'შეტყობინება წარმატებით გაიგზავნა',
    });
  } catch (error) {
    console.error('❌ Mail send error:', error);

    return res.status(500).json({
      success: false,
      message: 'შეტყობინების გაგზავნა ვერ მოხერხდა',
    });
  }
}

module.exports = {
  reportProblem,
};