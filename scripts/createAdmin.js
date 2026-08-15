require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // თუ პროექტში 'bcrypt' გაქვთ (არა bcryptjs) — შეცვალეთ ეს სტრიქონი
const readline = require('readline');
const User = require('../models/User');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    if (!hidden) {
      rl.question(question, (answer) => resolve(answer.trim()));
      return;
    }
    // პაროლის დამალვით შეყვანა (ტერმინალში არ გამოჩნდეს)
    process.stdout.write(question);
    let input = '';
    const onData = (char) => {
      char = char.toString('utf8');
      if (char === '\n' || char === '\r' || char === '\u0004') {
        process.stdin.setRawMode(false);
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input.trim());
      } else if (char === '\u0003') {
        process.exit();
      } else if (char === '\u007f') {
        input = input.slice(0, -1);
      } else {
        input += char;
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

async function main() {
  console.log('=== ახალი ადმინის შექმნა ===\n');

  const firstName = await ask('სახელი: ');
  const lastName = await ask('გვარი: ');
  const phone = await ask('ტელეფონი (მაგ. 5XXXXXXXX): ');
  // ⚠️ email სავალდებულოა — login() email-ზეა დამოკიდებული (იხ. smsverifikation.service.ts)
  const email = await ask('ემეილი (სავალდებულო! login ამით ხდება): ');
  // ⚠️ personalNumber სავალდებულოა User სქემაში (required: true)
  const personalNumber = await ask('პირადი ნომერი: ');
  const password = await ask('პაროლი: ', true);
  const passwordConfirm = await ask('გაიმეორეთ პაროლი: ', true);

  rl.close();

  if (!firstName || !lastName || !phone || !email || !personalNumber || !password) {
    console.error('\n❌ სახელი, გვარი, ტელეფონი, ემეილი, პირადი ნომერი და პაროლი სავალდებულოა.');
    process.exit(1);
  }

  if (password !== passwordConfirm) {
    console.error('\n❌ პაროლები არ ემთხვევა.');
    process.exit(1);
  }

  if (password.length < 6) {
    console.error('\n❌ პაროლი უნდა იყოს მინიმუმ 6 სიმბოლო.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB დაკავშირებულია...');

    const existing = await User.findOne({
      $or: [{ phone }, { email }, { personalNumber }]
    });

    const hashedPassword = await bcrypt.hash(password, 10);

    if (existing) {
      existing.role = 'admin';
      existing.isBanned = false;
      existing.password = hashedPassword;
      existing.email = email;
      existing.phone = phone;
      existing.personalNumber = personalNumber;
      existing.firstName = firstName;
      existing.lastName = lastName;
      // ვცდილობთ verified ველების დაყენებას, თუ სქემაში არსებობს
      // (თუ ველი სქემაში არ არსებობს, mongoose უბრალოდ უგულებელყოფს)
      existing.isPhoneVerified = true;
      existing.phoneVerified = true;

      await existing.save();
      console.log(`\n✅ არსებული მომხმარებელი "${existing.email}" გახდა admin.`);
    } else {
      const newAdmin = new User({
        firstName,
        lastName,
        phone,
        email,
        personalNumber,
        password: hashedPassword,
        role: 'admin',
        isBanned: false,
        isPhoneVerified: true,
        phoneVerified: true
      });

      await newAdmin.save();
      console.log(`\n✅ ახალი admin შეიქმნა: ${newAdmin.email}`);
    }
  } catch (err) {
    console.error('\n❌ შეცდომა:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();