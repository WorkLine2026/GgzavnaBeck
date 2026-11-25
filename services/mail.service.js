const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * აგზავნის მომხმარებლის პრობლემას, იმეილს და ტელეფონს
 * support-გუნდის მეილზე Resend API-ის საშუალებით.
 * @param {{ text: string, email: string, phone: string }} payload
 */
async function sendProblemMail({ text, email, phone }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY არ არის კონფიგურირებული .env ფაილში');
  }

  const { data, error } = await resend.emails.send({
    from: 'Gagzavna Support <onboarding@resend.dev>',
    to: process.env.SUPPORT_EMAIL,
    replyTo: email, // "Reply"-ზე დაჭერით პირდაპირ მომხმარებელს უპასუხებ
    subject: `🆘 ახალი პრობლემა საიტიდან — ${singleLine(phone)}`,
    text: `ელ-ფოსტა: ${email}\nტელეფონი: ${phone}\n\nპრობლემა:\n${text}`,
    html: `
      <p><b>ახალი პრობლემა საიტიდან</b></p>
      <p><b>ელ-ფოსტა:</b> ${escapeHtml(email)}</p>
      <p><b>ტელეფონი:</b> ${escapeHtml(phone)}</p>
      <p><b>პრობლემა:</b></p>
      <p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>
    `,
  });

  if (error) {
    throw new Error(`Resend API შეცდომა: ${error.message}`);
  }

  return data;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// subject-ში ახალი ხაზები არ უნდა მოხვდეს
function singleLine(str) {
  return String(str).replace(/[\r\n]+/g, ' ').trim();
}

module.exports = { sendProblemMail };