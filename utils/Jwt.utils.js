/**
 * 📱 SMS Verification Service
 * Twilio ან ნებისმიერი SMS provider-ის ინტეგრაცია
 */

const { generateSmsCode, getSmsCodeExpiry } = require('../utils/jwt.utils');

// ═══════════════════════════════════════════════════════════════════
// 🔧 SMS PROVIDER INITIALIZATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Twilio კლიენტი (თუ გაააქტიურებთ)
 * npm install twilio
 */
let twilioClient = null;

if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  const twilio = require('twilio');
  twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  console.log('✅ Twilio SMS უკუქვე მზად');
} else {
  console.log('⚠️ Twilio არ არის კონფიგურირებული, ვიყენებთ მოკ-ს');
}

// ═══════════════════════════════════════════════════════════════════
// 📤 SMS SENDING SERVICE
// ═══════════════════════════════════════════════════════════════════

/**
 * SMS კოდის გაგზავნა ფოსტელი ნომერზე
 * @param {String} phoneNumber - ფულიფორმატის ნომერი (+995XXXXXXXXX)
 * @param {String} code - 4-ნიშნა კოდი
 * @returns {Promise<Object>} - გაგზავნის შედეგი
 */
const sendVerificationCode = async (phoneNumber, code) => {
  // ✅ დეველოპმენტი მოდი - კონსოლში ლოგი
  if (process.env.NODE_ENV === 'development' || !twilioClient) {
    console.log(`
╔════════════════════════════════════════════╗
║ 📱 SMS კოდი სიმულაციის რეჟიმი            ║
║ ────────────────────────────────────────── ║
║ ნომერი: ${phoneNumber}
║ კოდი: ${code}
║ ვალიდობა: 5 წუთი                          ║
╚════════════════════════════════════════════╝
    `);

    return {
      success: true,
      message: `კოდი გაგზავნილია ${phoneNumber}`,
      sid: `mock-${Date.now()}`, // მოკ SID
      code // დეველოპმენტი - კოდის დაბრუნება
    };
  }

  // ✅ რეალური Twilio SMS გაგზავნა (production)
  try {
    const message = await twilioClient.messages.create({
      body: `თქვენი Gagzavna.ge ვერიფიკაციის კოდი: ${code}\nკოდი ვალიდურია 5 წუთის განმავლობაში.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });

    console.log(`✅ SMS წარმატებით გაიგზავნა: ${message.sid}`);

    return {
      success: true,
      message: 'კოდი გაიგზავნა',
      sid: message.sid
    };
  } catch (error) {
    console.error('❌ SMS გაგზავნის შეცდომა:', error.message);
    throw new Error('SMS გაგზავნა ვერ მოხერხდა');
  }
};

// ═══════════════════════════════════════════════════════════════════
// ✅ SMS CODE VALIDATION
// ═══════════════════════════════════════════════════════════════════

/**
 * SMS კოდის ვალიდაცია
 * @param {String} providedCode - მომხმარებლის მიერ შეყვანილი კოდი
 * @param {String} storedCode - სერვერის მხრიდან შენახული კოდი
 * @param {Date} expiryTime - კოდის ექსპირაციის დრო
 * @returns {Object} - ვალიდაციის შედეგი
 */
const validateSmsCode = (providedCode, storedCode, expiryTime) => {
  // ✅ ვალიდაცია 1: კოდი არსებობს?
  if (!storedCode) {
    return {
      valid: false,
      error: 'კოდი ვერ მოიძებნა. სცადეთ ხელახლა გაგზავნა'
    };
  }

  // ✅ ვალიდაცია 2: კოდი ვერ არის უკვე გამოთხოვილი?
  if (!expiryTime || new Date() > expiryTime) {
    return {
      valid: false,
      error: 'კოდი მოშლილია. გთხოვთ კოდის ხელახლა გაგზავნა'
    };
  }

  // ✅ ვალიდაცია 3: კოდი სწორია?
  if (providedCode !== storedCode) {
    return {
      valid: false,
      error: 'კოდი არასწორია'
    };
  }

  // ✅ ყველა ოკეი
  return {
    valid: true,
    message: 'კოდი დადასტურდა'
  };
};

// ═══════════════════════════════════════════════════════════════════
// 🔄 RESEND CODE WITH COOLDOWN
// ═══════════════════════════════════════════════════════════════════

/**
 * Cooldown მენეჯმენტი (დროს მწკრივი რეგისტრაციის თავიდან აცილება)
 * გაჯ: 30 წამი შორის
 */
const resendCooldownSeconds = 30;
const resendAttempts = new Map(); // { phoneNumber: { lastAttempt, count } }

/**
 * Resend-ის შესაძლებლობის შემოწმება
 */
const canResendCode = (phoneNumber) => {
  const attempt = resendAttempts.get(phoneNumber);

  if (!attempt) {
    return { allowed: true, secondsUntilRetry: 0 };
  }

  const secondsElapsed = Math.floor(
    (Date.now() - attempt.lastAttempt) / 1000
  );

  if (secondsElapsed < resendCooldownSeconds) {
    const secondsUntilRetry = resendCooldownSeconds - secondsElapsed;
    return { allowed: false, secondsUntilRetry };
  }

  // ✅ ლიმიტი - max 5 ცდა
  if (attempt.count >= 5) {
    return {
      allowed: false,
      secondsUntilRetry: 0,
      error: 'ბევრი რაზე ცდა. გთხოვთ მოიცადეთ რამდენიმე წუთი'
    };
  }

  return { allowed: true, secondsUntilRetry: 0 };
};

/**
 * Resend ატემპტის ჩაწერა
 */
const recordResendAttempt = (phoneNumber) => {
  const attempt = resendAttempts.get(phoneNumber) || { count: 0 };
  attempt.lastAttempt = Date.now();
  attempt.count += 1;
  resendAttempts.set(phoneNumber, attempt);
};

/**
 * გასუფთავება - ძველი ატემპტები
 */
const cleanupOldAttempts = () => {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [phone, data] of resendAttempts.entries()) {
    if (data.lastAttempt < tenMinutesAgo) {
      resendAttempts.delete(phone);
    }
  }
};

// გასუფთავება ყოველ 5 წუთში
setInterval(cleanupOldAttempts, 5 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════
// 🌐 FORMAT PHONE NUMBER
// ═══════════════════════════════════════════════════════════════════

/**
 * თბილისის ტელეფონის ნომერი (599000000) -> სრული (+995599000000)
 */
const formatPhoneNumber = (localPhone) => {
  // თუ + არ აქვს, დაამატე
  if (!localPhone.startsWith('+')) {
    return `+995${localPhone}`;
  }
  return localPhone;
};

/**
 * ნომერი დამალე ხუთობითი თანმიმდევრობით
 * +995599000000 -> +995 59* **** **00
 */
const maskPhoneNumber = (phone) => {
  const cleaned = phone.replace(/\D/g, ''); // მხოლოდ ციფრები
  if (cleaned.length < 10) return phone;
  
  const lastDigits = cleaned.slice(-2);
  const firstDigits = cleaned.slice(0, 4);
  return `+${firstDigits} *** **** **${lastDigits}`;
};

module.exports = {
  sendVerificationCode,
  validateSmsCode,
  canResendCode,
  recordResendAttempt,
  formatPhoneNumber,
  maskPhoneNumber
};