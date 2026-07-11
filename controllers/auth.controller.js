const User = require('../models/User');
const { sendSMS } = require('../services/sms.service');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/**
 * დამხმარე ფუნქცია: ნომრიდან 995 პრეფიქსის მოცილება
 */
const getCleanPhone = (phone) => {
  if (!phone) return '';
  return phone.toString().startsWith('995') ? phone.toString().replace(/^995/, '') : phone.toString();
};

// ================== LOGIN ==================
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('--- LOGIN REQUEST ---');
    console.log('Email:', email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'ელფოსტა და პაროლი სავალდებულოა'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'ელფოსტა ან პაროლი არასწორია'
      });
    }

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'ელფოსტა ან პაროლი არასწორია'
      });
    }

    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '7d' }
    );

    console.log('✅ Login successful for user:', user._id);

    return res.status(200).json({
      success: true,
      message: 'წარმატებული შესვლა',
      token: token,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        phoneVerified: user.phoneVerified
      }
    });

  } catch (error) {
    console.error('LOGIN ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'სერვერის შეცდომა შესვლის დროს'
    });
  }
};

// ================== REGISTER ==================
exports.register = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      personalNumber,
      email,
      phone,
      password,
      role,
      carModel,
      carPlate,
      driverLicenseNumber
    } = req.body;

    console.log('--- REGISTER REQUEST ---');
    console.log('Body:', { firstName, lastName, personalNumber, email, phone, role, carModel, carPlate, driverLicenseNumber });

    const cleanPhone = getCleanPhone(phone);
    const formattedPhone = `995${cleanPhone}`;

    const existingUser = await User.findOne({
      $or: [
        { phone: formattedPhone },
        { phone: cleanPhone },
        { email },
        { personalNumber }
      ]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'მომხმარებელი ამ ნომრით, მეილით ან პირადი ნომრით უკვე არსებობს'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const reference = `otp-${Date.now()}`;
    const smsText = `თქვენი რეგისტრაციის კოდია: ${otpCode}`;

    console.log('Generated OTP:', otpCode);

    const smsResponse = await sendSMS({
      phone: formattedPhone,
      content: smsText,
      reference
    });

    console.log('SMS Response in controller:', smsResponse);

    if (!smsResponse || smsResponse.Success !== true) {
      console.error('SMS გაგზავნა ჩავარდა:', smsResponse);
      return res.status(400).json({
        success: false,
        message: 'SMS ვერ გაიგზავნა, მომხმარებელი არ დაემატა',
        sms: smsResponse
      });
    }

    const newUser = await User.create({
      firstName,
      lastName,
      personalNumber,
      email,
      phone: formattedPhone,
      password: hashedPassword,
      role,
      phoneVerified: false,
      // ✅ დამატებული მძღოლის ველები — რეგისტრაციაში მითითებული მონაცემები ბაზაში ინახება
      carModel: role === 'driver' ? carModel : null,
      carPlate: role === 'driver' ? carPlate : null,
      driverLicenseNumber: role === 'driver' ? driverLicenseNumber : null,
      smsVerification: {
        code: otpCode,
        expiresAt,
        attempts: 0,
        reference
      }
    });

    return res.status(201).json({
      success: true,
      message: 'მომხმარებელი დარეგისტრირდა. ვერიფიკაციის კოდი გაიგზავნა ნომერზე.',
      userId: newUser._id,
      code: otpCode
    });
  } catch (error) {
    console.error('REGISTER ERROR:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'სერვერის შეცდომა რეგისტრაციისას'
    });
  }
};

// ================== VERIFY PHONE ==================
exports.verifyPhone = async (req, res) => {
  try {
    const { phone, code } = req.body;

    console.log('--- VERIFY REQUEST ---');
    console.log('Phone:', phone);
    console.log('Code:', code);

    const cleanPhone = getCleanPhone(phone);

    const user = await User.findOne({
      $or: [{ phone: `995${cleanPhone}` }, { phone: cleanPhone }]
    }).select('+smsVerification.code +smsVerification.expiresAt +smsVerification.attempts +smsVerification.reference');

    if (!user || !user.smsVerification || !user.smsVerification.code) {
      return res.status(400).json({
        success: false,
        message: 'აქტიური ვერიფიკაციის მოთხოვნა არ არსებობს'
      });
    }

    if (user.smsVerification.attempts >= 3) {
      return res.status(400).json({ success: false, message: 'ცდების რაოდენობა ამოიწურა' });
    }

    if (new Date() > user.smsVerification.expiresAt) {
      return res.status(400).json({ success: false, message: 'კოდს ვადა გაუვიდა' });
    }

    if (user.smsVerification.code !== code) {
      user.smsVerification.attempts += 1;
      await user.save();
      return res.status(400).json({ success: false, message: 'არასწორი კოდი' });
    }

    user.phoneVerified = true;
    user.smsVerification = undefined;
    await user.save();

    // ✅ JWT Token შექმნა — რომ მომხმარებელი პირდაპირ ავტორიზებული დარჩეს ვერიფიკაციის შემდეგ
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      message: 'რეგისტრაცია წარმატებით დასრულდა და ნომერი დავერიფიცირდა!',
      token: token,
      user: user.toPublic()
    });
  } catch (error) {
    console.error('VERIFY ERROR:', error);
    return res.status(500).json({ success: false, message: 'სერვერის შეცდომა ვერიფიკაციისას' });
  }
};

// ================== FORGOT PASSWORD - SEND CODE ==================
exports.sendForgotPasswordCode = async (req, res) => {
  try {
    const { phone } = req.body;

    console.log('--- FORGOT PASSWORD - SEND CODE ---');
    console.log('Phone from request:', phone);

    const cleanPhone = getCleanPhone(phone);
    const formattedPhone = `995${cleanPhone}`;

    const user = await User.findOne({
      $or: [{ phone: formattedPhone }, { phone: cleanPhone }]
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'ამ ნომერით მომხმარებელი არ არსებობს'
      });
    }

    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const reference = `fp-${Date.now()}`;
    const smsText = `თქვენი პაროლის აღდგენის კოდია: ${otpCode}`;

    console.log('Generated OTP for password recovery:', otpCode);
    console.log('Shortened Reference for SMSOffice:', reference);

    const smsResponse = await sendSMS({
      phone: formattedPhone,
      content: smsText,
      reference
    });

    if (!smsResponse || smsResponse.Success !== true) {
      console.error('SMS გაგზავნა ჩავარდა:', smsResponse);
      return res.status(400).json({ success: false, message: 'SMS ვერ გაიგზავნა' });
    }

    user.smsVerification = {
      code: otpCode,
      expiresAt,
      attempts: 0,
      reference
    };
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'დადასტურების კოდი გაიგზავნა ნომერზე',
      code: otpCode
    });
  } catch (error) {
    console.error('SEND FORGOT PASSWORD CODE ERROR:', error);
    return res.status(500).json({ success: false, message: 'სერვერის შეცდომა' });
  }
};

// ================== FORGOT PASSWORD - VERIFY CODE ==================
exports.verifyForgotPasswordCode = async (req, res) => {
  try {
    const { phone, code } = req.body;

    console.log('--- FORGOT PASSWORD - VERIFY CODE ---');
    console.log('Phone:', phone);
    console.log('Code:', code);

    const cleanPhone = getCleanPhone(phone);

    const user = await User.findOne({
      $or: [{ phone: `995${cleanPhone}` }, { phone: cleanPhone }]
    }).select('+smsVerification.code +smsVerification.expiresAt +smsVerification.attempts +smsVerification.reference');

    if (!user || !user.smsVerification || !user.smsVerification.code) {
      return res.status(400).json({ success: false, message: 'აქტიური კოდის მოთხოვნა არ არსებობს' });
    }

    if (user.smsVerification.attempts >= 3) {
      return res.status(400).json({ success: false, message: 'ცდების რაოდენობა ამოიწურა' });
    }

    if (new Date() > user.smsVerification.expiresAt) {
      return res.status(400).json({ success: false, message: 'კოდს ვადა გაუვიდა' });
    }

    if (user.smsVerification.code !== code) {
      user.smsVerification.attempts += 1;
      await user.save();
      return res.status(400).json({ success: false, message: 'არასწორი კოდი' });
    }

    const resetToken = `reset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const resetTokenExpires = new Date(Date.now() + 5 * 60 * 1000);

    user.smsVerification = {
      code: resetToken,
      expiresAt: resetTokenExpires,
      attempts: 0,
      reference: 'reset-password-token'
    };
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'კოდი დადასტურდა. ახლა პაროლი შეუძლია შეცვალოს.',
      resetToken: resetToken,
      expirationMinutes: 5
    });
  } catch (error) {
    console.error('VERIFY FORGOT PASSWORD CODE ERROR:', error);
    return res.status(500).json({ success: false, message: 'სერვერის შეცდომა' });
  }
};

// ================== FORGOT PASSWORD - RESET PASSWORD ==================
exports.resetPassword = async (req, res) => {
  try {
    const { phone, resetToken, newPassword } = req.body;

    console.log('--- RESET PASSWORD ---');
    console.log('Phone:', phone);

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'პაროლი უნდა იყოს მინიმუმ 6 სიმბოლო' });
    }

    const cleanPhone = getCleanPhone(phone);

    const user = await User.findOne({
      $or: [{ phone: `995${cleanPhone}` }, { phone: cleanPhone }]
    }).select('+smsVerification.code +smsVerification.expiresAt +smsVerification.reference');

    if (!user || !user.smsVerification) {
      return res.status(400).json({ success: false, message: 'ვერიფიკაციის სესია არ არსებობს' });
    }

    if (user.smsVerification.code !== resetToken) {
      return res.status(400).json({ success: false, message: 'არასწორი ან მოძველებული token' });
    }

    if (new Date() > user.smsVerification.expiresAt) {
      return res.status(400).json({ success: false, message: 'reset token-ის ვადა გაუვიდა' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.smsVerification = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'პაროლი წარმატებით განახლდა. ახლა შეძლებთ ავტორიზაციას'
    });
  } catch (error) {
    console.error('RESET PASSWORD ERROR:', error);
    return res.status(500).json({ success: false, message: 'სერვერის შეცდომა პაროლის განახლებისას' });
  }
};

// ================== GET PROFILE (მიმდინარე მომხმარებელი) ==================
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'მომხმარებელი ვერ მოიძებნა'
      });
    }

    return res.status(200).json({
      success: true,
      user: user.toPublic()
    });
  } catch (error) {
    console.error('GET PROFILE ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'სერვერის შეცდომა პროფილის ჩატვირთვისას'
    });
  }
};

// ================== UPDATE PROFILE ==================
exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, email, carModel, carPlate, driverLicenseNumber } = req.body;

    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'მომხმარებელი ვერ მოიძებნა'
      });
    }

    if (email && email.toLowerCase() !== user.email) {
      const existingEmail = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: user._id }
      });

      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: 'ეს ელფოსტა უკვე გამოყენებულია'
        });
      }

      user.email = email.toLowerCase();
    }

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;

    if (user.role === 'driver') {
      if (carPlate && carPlate !== user.carPlate) {
        const existingPlate = await User.findOne({
          carPlate,
          _id: { $ne: user._id }
        });

        if (existingPlate) {
          return res.status(400).json({
            success: false,
            message: 'ეს სახელმწიფო ნომერი უკვე დაკავებულია'
          });
        }
      }

      if (carModel !== undefined) user.carModel = carModel;
      if (carPlate !== undefined) user.carPlate = carPlate;
      if (driverLicenseNumber !== undefined) user.driverLicenseNumber = driverLicenseNumber;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'ცვლილებები წარმატებით შენახდა',
      user: user.toPublic()
    });
  } catch (error) {
    console.error('UPDATE PROFILE ERROR:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'ეს მონაცემი უკვე გამოყენებულია'
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors)[0]?.message || 'მონაცემები არასწორია'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'ცვლილებები ვერ შენახდა'
    });
  }
};

// ================== DELETE ACCOUNT ==================
exports.deleteAccount = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'მომხმარებელი ვერ მოიძებნა'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'ანგარიში წარმატებით წაიშალა'
    });
  } catch (error) {
    console.error('DELETE ACCOUNT ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'ანგარიშის წაშლა ვერ მოხერხდა'
    });
  }
};