const { sendProblemMail } = require('../services/mail.service');

async function reportProblem(req, res) {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'ტექსტი სავალდებულოა',
      });
    }

    await sendProblemMail(text.trim());

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