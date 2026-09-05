const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * აგზავნის მომხმარებლის პრობლემის ტექსტს support-გუნდის მეილზე Resend API-ის საშუალებით.
 * @param {string} text - მომხმარებლის მიერ დაწერილი პრობლემა
 */
async function sendProblemMail(text) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY არ არის კონფიგურირებული .env ფაილში');
  }

  const { data, error } = await resend.emails.send({
    from: 'Gagzavna Support <onboarding@resend.dev>',
    to: process.env.SUPPORT_EMAIL,
    subject: '🆘 ახალი პრობლემა საიტიდან',
    text,
    html: `<p><b>ახალი პრობლემა საიტიდან:</b></p><p>${escapeHtml(text)}</p>`,
  });

  if (error) {
    throw new Error(`Resend API შეცდომა: ${error.message}`);
  }

  return data;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

module.exports = { sendProblemMail };