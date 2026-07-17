/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from '../user/schema/user.schema';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/signup.dto';
import { SocialLoginDto  } from './dto/social-login.dto';
import { LoginDto } from './dto/login.dto';
import { DatabaseService } from "src/database/databaseservice";
import { OtpService } from 'src/user/schema/otp/otp.service';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';


@Injectable()
export class AuthService {
   private googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID); // 👈 Google Client
  constructor(
   
    private databaseService: DatabaseService,
    private readonly otpService: OtpService, 

    private readonly jwtService: JwtService
  ) {}


  private getUserModel(userType: string) {
  return userType === 'parent'
    ? this.databaseService.repositories.parentModel
    : this.databaseService.repositories.driverModel;
}

  // ✅ Signup
async registerUser(registerDto: RegisterDto) {
  try {
    const { email, password, userType } = registerDto;

    const userModel = this.getUserModel(userType);

    // Check if user already exists
    const existingUser = await userModel.findOne({ email });

    if (existingUser) {
      if (existingUser.isDelete === true) {
        // Agar account delete tha → revive karo
        existingUser.isDelete = false;

        // OTP dobara generate karo
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

        existingUser.otp = otp;
        existingUser.otpExpiresAt = otpExpiresAt;
        existingUser.isVerified = false;

        // Password update agar naya diya gaya ho
        if (password) {
          existingUser.password = await bcrypt.hash(password, 10);
        }

        await existingUser.save();

        // OTP send karo
        await this.otpService.sendOtp(email, existingUser.otp);

        return {
          message: 'Your account was deleted before, we have reactivated it. OTP sent again.',
          data: {
            userId: existingUser._id,
            otp: existingUser.otp,
          },
        };
      } else {
        // Agar account delete nahi tha
        throw new UnauthorizedException('User already exists');
      }
    }

    // Naya user banane ka flow
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const userData: any = {
      ...registerDto,
      otp,
      otpExpiresAt,
      isVerified: false,
    };

    if (password) {
      userData.password = await bcrypt.hash(password, 10);
    }

    const user = new userModel(userData);
    await user.save();

    await this.otpService.sendOtp(email, otp);

    return {
      message: 'OTP sent successfully to your email/phone',
      data: {
        userId: user._id,
        otp: user.otp,
      },
    };
  } catch (error) {
    throw new UnauthorizedException(error.message || 'Registration failed');
  }
}



async loginUser(loginData: any) {
  try {
    const { userType, email, loginId, password, fcmToken} = loginData;

    console.log("llllllllllll", loginData)

    const userModel = this.getUserModel(userType);

    // Accept login via email, phone number, or CNIC (NIC) — drivers in
    // particular often can't manage email/OTP, so phone/CNIC + a
    // password set by the admin is the practical login path for them.
    const identifier = (email || loginId || '').toString().trim();

    const user = await userModel.findOne({
      $or: [
        { email: identifier },
        { phoneNo: identifier },
        { NIC: identifier },
      ],
    });
   if (!user) {
  throw new UnauthorizedException({
    message: 'logiin failed',
    statusCode: 401
  });
}


       if (user.isDelete == true) {
      throw new UnauthorizedException('Your account has been deleted. You cannot login.');
    }



    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isVerified) {
  throw new UnauthorizedException('Account not verified. Please verify OTP first');
}

    // Track when this user last actually logged in — used by the admin
    // panel to show whether a driver/parent has connected to the app yet.
    user.lastLoginAt = new Date();
    await user.save();

        if (fcmToken) {
      if (!user.fcmToken) {
        // Agar DB me fcmToken nahi hai to save karo
        user.fcmToken = fcmToken;
        await user.save();
      } else if (user.fcmToken !== fcmToken) {
        // Agar DB wala different hai to update karo
        user.fcmToken = fcmToken;
        await user.save();
      }
      // Agar same hai to kuch mat karo
    }

  
    const payload = {
      sub: user._id,
      email: user.email,
      userType: user.userType
    };

    const token = await this.jwtService.signAsync(payload);

    return {
      message: 'Login successful',
      data: {
      token,
      userId: user._id,
      fullname: user.fullname,
      isVerified: user.isVerified
    
      },
    };
  } catch (error) {
    throw new UnauthorizedException(error.message || 'Login failed');
  }
}



async resendOtp(email: string, userType: string) {
  try {
    const userModel = this.getUserModel(userType);
    const user = await userModel.findOne({ email });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.isVerified) {
      throw new UnauthorizedException('User already verified');
    }

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.otp = newOtp;
    user.otpExpiresAt = otpExpiresAt;
    await user.save();

    await this.otpService.sendOtp(user.email, newOtp);

    return {
      message: 'New OTP sent successfully to your email',
      data: {
      
      userId: user._id,
      otp: user.otp
    
      },
    };
  } catch (error) {
    throw new UnauthorizedException(error.message || 'Resend OTP failed');
  }
}

async verifyOtp(email: string, userType: string, otp: string) {
  try {
    const userModel = this.getUserModel(userType);
    const user = await userModel.findOne({ email });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.isVerified) {
      throw new UnauthorizedException('User already verified');
    }

    if (user.otp !== otp) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const currentTime = new Date();
    if (user.otpExpiresAt && currentTime > user.otpExpiresAt) {
      throw new UnauthorizedException('OTP has expired');
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpiresAt = null;
    await user.save();

    const payload = { sub: user._id, email: user.email, userType: user.userType };
    const token = this.jwtService.sign(payload, { expiresIn: '1h' });

    return {
      message: 'OTP verified successfully',
      data: {
      token,
      user: {
        _id: user._id,
        fullname: user.fullname,
        email: user.email,
        userType: user.userType,
        phoneNo: user.phoneNo,
        address: user.address,
      },
      },
    };
  } catch (error) {
    throw new UnauthorizedException(error.message || 'OTP verification failed');
  }
}

async verifyOtpForgot(email: string, userType: string, otp: string) {
  try {
    const userModel = this.getUserModel(userType);
    const user = await userModel.findOne({ email });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    

    if (user.otp !== otp) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const currentTime = new Date();
    if (user.otpExpiresAt && currentTime > user.otpExpiresAt) {
      throw new UnauthorizedException('OTP has expired');
    }

    
   
    return {
      message: 'OTP verified successfully',
      data: null,
    };
  } catch (error) {
    throw new UnauthorizedException(error.message || 'OTP verification failed');
  }
}

async getProfile(userId: string, userType: string) {
  try {
    if (!userId || !userType) {
      throw new UnauthorizedException('Invalid user credentials');
    }

    // ✅ 1. Select correct model
    const userModel = this.getUserModel(userType);

    // ✅ 2. Find user
    const user = await userModel
      .findById(userId)
      .select('-password -otp -otpExpiresAt');

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.isDelete == true) {
      throw new UnauthorizedException(
        'Your account is deleted, you cannot view your profile',
      );
    }

    let schoolName = null; // 👈 default null
    let vanDetails = null;

    // ✅ 3. Only for driver → fetch school + assigned van
    if (userType === 'driver') {
      if (user.schoolId) {
        const school = await this.databaseService.repositories.SchoolModel.findById(user.schoolId);

        if (school) {
          schoolName = school.schoolName; // 👈 field name check kar lena
        }
      }

      const van = await this.databaseService.repositories.VanModel.findOne({ driverId: user._id });
      if (van) {
        vanDetails = {
          vanModel: (van as any).vehicleType || null,
          plateNumber: (van as any).carNumber || null,
          seats: (van as any).venCapacity || null,
        };
      }
    }

    // ✅ 4. Response
    return {
      message: 'User profile fetched successfully',
      data: {
        ...user.toObject(), // 👈 mongoose doc → plain object
        schoolName,         // 👈 add extra field
        ...(vanDetails || {}),
      },
    };
  } catch (error) {
    throw new UnauthorizedException(
      error.message || 'Failed to fetch profile',
    );
  }




}


async socialLogin(
  authProvider: string,
  token: string,
  userType: string,
  userName: string,
  email: string,
  socialId: string,
  image: string,
  fcmToken: string,
) {
  try {
    console.log("authProvider:", authProvider);
    console.log("token:", token);
    console.log("userType:", userType);
    console.log("userName:", userName);
    console.log("email:", email);
    console.log("socialId:", socialId);
    console.log("image:", image);
    console.log("fcmToken:", fcmToken);

    if (!userType || !socialId || !email) {
      throw new UnauthorizedException(
        'userType, email and socialId must be given',
      );
    }

    const model = this.getUserModel(userType);

    /**
     * Pehle user ko providerId ya email se find karo.
     * Kyun?
     * - providerId se existing social user milega
     * - email se deleted account ya old account milega
     */
    let user = await model.findOne({
      $or: [
        { providerId: socialId },
        { email: email },
      ],
    });

    /**
     * CASE 1:
     * Agar user mila aur account soft deleted hai,
     * to same account restore kar do.
     */
    if (user && user.isDelete === true) {
      user.isDelete = false;
      user.isVerified = true;
      user.providerId = socialId;
      user.authProvider = authProvider;
      user.userType = userType;

      if (userName) {
        user.fullname = userName;
      }

      if (image) {
        user.image = image;
      }

      if (fcmToken) {
        user.fcmToken = fcmToken;
      }

    

      await user.save();

      const payload = {
        sub: user._id,
        email: user.email,
        userType: user.userType,
      };

      const jwtToken = this.jwtService.sign(payload, {
        expiresIn: '1h',
      });

      return {
        message: 'Account restored and social login successful',
        data: {
          token: jwtToken,
          user,
        },
      };
    }

    /**
     * CASE 2:
     * Agar same email ka active password account hai,
     * to social login allow nahi karna.
     */
    if (user && user.password && user.isDelete !== true) {
      throw new UnauthorizedException(
        'This email is already registered with password. Use normal login.',
      );
    }

    /**
     * CASE 3:
     * Agar user already social login se exist karta hai,
     * to latest details update kar do.
     */
    if (user) {
      let shouldSave = false;

      if (user.providerId !== socialId) {
        user.providerId = socialId;
        shouldSave = true;
      }

      if (user.authProvider !== authProvider) {
        user.authProvider = authProvider;
        shouldSave = true;
      }

      if (userName && user.fullname !== userName) {
        user.fullname = userName;
        shouldSave = true;
      }

      if (image && user.image !== image) {
        user.image = image;
        shouldSave = true;
      }

      if (user.isVerified !== true) {
        user.isVerified = true;
        shouldSave = true;
      }

      if (user.isDelete !== false) {
        user.isDelete = false;
        shouldSave = true;
      }

      if (fcmToken && user.fcmToken !== fcmToken) {
        user.fcmToken = fcmToken;
        shouldSave = true;
      }

    
      shouldSave = true;

      if (shouldSave) {
        await user.save();
      }
    }

    /**
     * CASE 4:
     * Agar user bilkul exist nahi karta,
     * to new social account create karo.
     */
    if (!user) {
      user = new model({
        fullname: userName,
        email,
        providerId: socialId,
        authProvider,
        userType,
        isVerified: true,
        isDelete: false,
        image: image || null,
        fcmToken: fcmToken || null,
      });

      await user.save();
    }

    const payload = {
      sub: user._id,
      email: user.email,
      userType: user.userType,
    };

    const jwtToken = this.jwtService.sign(payload, {
      expiresIn: '1h',
    });

    return {
      message: 'Social login successful',
      data: {
        token: jwtToken,
        user,
      },
    };
  } catch (error) {
    console.log(error);
    throw new UnauthorizedException(error.message || 'Social login failed');
  }
}
async forgotPassword(email: string, userType: string) {
  try {
    
    const model = this.getUserModel(userType);

 
    const user = await model.findOne({ email });
    if (!user) {
      throw new UnauthorizedException('User not found with this email');
    }

    // 🔁 Step 3: OTP & expiry generate karo
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    // ✍️ Step 4: Update OTP & expiry in DB
    user.otp = otp;
    user.otpExpiresAt = otpExpiresAt;
    await user.save();

    // 📧 Step 5: Send OTP to user's email
    await this.otpService.sendOtp(user.email, otp);

    // ✅ Step 6: Response return
    return {
      message: 'OTP sent to your email for password reset',
      data: {
      
      userId: user._id,
      otp: user.otp, 
    
      },
    };
  } catch (error) {
    throw new UnauthorizedException(error.message || 'Forgot password failed');
  }
}

async resetPassword(email: string, userType: string, otp: string, newPassword: string) {
  try {
    // 🔍 Model choose karo
    const model = this.getUserModel(userType);

    // 🔍 User dhoondo
    const user = await model.findOne({ email });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // ❌ OTP match nahi karta
    if (user.otp !== otp) {
      throw new UnauthorizedException('Invalid OTP');
    }

    // ❌ OTP expire to nahi ho gaya
    const now = new Date();
    if (!user.otpExpiresAt || now > user.otpExpiresAt) {
      throw new UnauthorizedException('OTP has expired');
    }

    // ✅ Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // ✍️ Save new password & clear OTP fields
    user.password = hashedPassword;
    user.otp = null;
    user.otpExpiresAt = null;
    await user.save();

    return {
      message: 'Your password has been changed successfully',
    };
  } catch (error) {
    throw new UnauthorizedException(error.message || 'Password reset failed');
  }
}
 
async resendOtpForResetPassword(email: string, userType: string) {
  try {
    const userModel = this.getUserModel(userType);
    const user = await userModel.findOne({ email });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('User is not verified yet');
    }

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.otp = newOtp;
    user.otpExpiresAt = otpExpiresAt;
    await user.save();

    await this.otpService.sendOtp(user.email, newOtp);

    return {
      message: 'OTP sent successfully to your email for password reset',
      data: {
      
      userId: user._id,
      otp: user.otp,
  
      },
    };
  } catch (error) {
    throw new UnauthorizedException(error.message || 'Resend OTP for password reset failed');
  }
}







  // ✅ Login
//   async login(loginDto: LoginDto) {
//   try {
//     const { email, password } = loginDto;

//     const user = await this.databaseService.repositories.userModel.findOne({ email });

//     if (!user) {
//       throw new UnauthorizedException('User not found');
//     }

    
    
//     if (user.authProvider) {
//       throw new UnauthorizedException(
//         `This account is registered using ${user.authProvider} login. Use social login.`
//       );
//     }

//     // 🔐 Local user → check password
//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) {
//       throw new UnauthorizedException('Invalid password');
//     }

//     // ✅ Generate token
//     const payload = { sub: user._id, email: user.email };
//     const token = this.jwtService.sign(payload);

//     return { message: 'Login successful', token };
//   } catch (error) {
//     throw new UnauthorizedException(error.message || 'Login failed');
//   }
// }
// async socialLogin(socialLoginDto: SocialLoginDto) {
//     try {
//       const { authProvider, token } = socialLoginDto;

//       let socialId: string;
//       let email: string;
//       let userName: string;

     
//       if (authProvider === 'google') {
//         const ticket = await this.googleClient.verifyIdToken({
//           idToken: token,
//           audience: process.env.GOOGLE_CLIENT_ID,
//         });

//         const payload = ticket.getPayload();
//         socialId = payload.sub;
//         email = payload.email;
//         userName = payload.name;
//       }

//       // ✅ Verify Facebook Token
//       else if (authProvider === 'facebook') {
//         const fbResponse = await axios.get(
//           `https://graph.facebook.com/me?fields=id,name,email&access_token=${token}`
//         );

//         socialId = fbResponse.data.id;
//         email = fbResponse.data.email;
//         userName = fbResponse.data.name;
//       }

 
//       else {
//         throw new UnauthorizedException('Unsupported auth provider');
//       }

   
//       let user = await this.databaseService.repositories.userModel.findOne({
//         providerId: socialId,
//         authProvider,
//       });

     
//       if (!user) {
//         user = new this.databaseService.repositories.userModel({
//           name: userName,
//           email,
//           providerId: socialId,
//           authProvider,
//         });

//         await user.save();
//       }

   
//       const payload = { sub: user._id, email: user.email };
//       const jwtToken = this.jwtService.sign(payload);

//       return { message: 'Social login successful', token: jwtToken };
//     } catch (error) {
//       throw new UnauthorizedException(error.message || 'Social login failed');
//     }
//   }

async changePassword(
  userId: string,
  userType: string,
  oldPassword: string,
  newPassword: string,
) {
  try {
    // 🔍 Model choose karo userType se
    const model = this.getUserModel(userType);

    // 🔍 User fetch karo userId se
    const user = await model.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // 🔑 Old password check karo
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Old password is incorrect');
    }

    // ✅ Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // ✍️ Save new password
    user.password = hashedPassword;
    await user.save();

    return {
      message: 'Your password has been changed successfully',
    };
  } catch (error) {
    throw new UnauthorizedException(error.message || 'Password change failed');
  }
}

async logout(userId: string, userType: string) {
  try {

    // 🔍 Model choose karo userType se
    const model = this.getUserModel(userType);

    // 🔍 User fetch karo userId se
    const user = await model.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // 🔑 FCM token null karo agar set hai
    if (user.fcmToken) {
      user.fcmToken = null;
      await user.save();
    }

    return { message: 'You have been logged out successfully' };
  } catch (error) {
    throw new UnauthorizedException(error.message || 'Logout failed');
  }
}

async deleteAccount(userId: string, userType: string) {
  try {
    // 🔍 Model choose karo userType se
    const model = this.getUserModel(userType);

    // 🔍 User dhoondo
    const user = await model.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.isDelete === false || user.isDelete === undefined) {
  user.isDelete = true;
  user.isVerified = false; // ✅ Account delete hone par verification hata do
  await user.save();
};              




   
    return { message: 'Your account has been deleted successfully' };
  } catch (error) {
    throw new UnauthorizedException(error.message || 'Account delete failed');
  }
}

async addDeleteReason(userId: string, userType: string, deleteReason: string) {
  try {

    const model = this.getUserModel(userType);

    // 🔍 User dhoondo
    const user = await model.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    
    user.deleteReason = deleteReason;

    await user.save();

    return { message: 'Delete reason saved successfully' };
  } catch (error) {
    throw new UnauthorizedException(error.message || 'Failed to save delete reason');
  }
}

async changeNotificationToggle(
  userId: string,
  userType: string,
  notificationToggle: boolean,
) {

  console.log(userId, userType, notificationToggle);

  try {
    if (!userId || !userType) {
      throw new BadRequestException('userId and userType are required');
    }

    const userModel = this.getUserModel(userType);

    const user = await userModel.findOne({
      _id: userId,
      isDelete: false,
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // ✅ Toggle update
    user.notificationToggle = notificationToggle;

    
   

    await user.save();

    return {
      message: `Notification turned ${notificationToggle ? 'ON' : 'OFF'} successfully`,
      data: {
        userId: user._id,
        notificationToggle: user.notificationToggle,
      },
    };

  } catch (error) {
    throw error;
  }
}



 }



