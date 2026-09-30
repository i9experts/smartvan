/* eslint-disable prettier/prettier */
import { Body, Controller, Post, Get, Query, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { AuthGuard } from '@nestjs/passport';
import { UseGuards } from '@nestjs/common';


@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ✅ Signup
  @Post('registeruser')
  async signup(@Body() signupDto:RegisterDto ) {
    return this.authService.registerUser(signupDto);
  }

  

   @Post('resend-otp') // ✅ POST /auth/resend-otp
  async resendOtp(@Body() body: { email: string; userType: string }) {
    const { email, userType } = body;
    return this.authService.resendOtp(email, userType);
  }

   @Post('login')
  async login(@Body() loginData: any) {
    console.log(loginData)
    return this.authService.loginUser(loginData);
  }

  @Post('verifyOtp') 
  async verifyOtp(@Body() body: { email: string; userType: string, otp: string }) {
    const { email, userType, otp } = body;
    return this.authService.verifyOtp(email, userType, otp);
  }


  @Post('verifyOtpForgot') // ✅ POST /auth/resend-otp
  async verifyOtpForgot(@Body() body: { email: string; userType: string, otp: string }) {
    const { email, userType, otp } = body;
    return this.authService.verifyOtpForgot(email, userType, otp);
  }

  @UseGuards(AuthGuard('jwt'))
    @Get('getProfile')
  async getKids(@Req() req: any) {
    const { userId, userType } = req.user; // 👈 token se extract hua
    return this.authService.getProfile(userId, userType);
  }
 @Post('social-login')
  async socialLogin(@Body() body: any) {
  const { authProvider, token, userType, userName, email, socialId, image, fcmToken } = body;
  
  return this.authService.socialLogin(authProvider, token, userType, userName, email, socialId, image, fcmToken);
}

 @Post('forgot-password')
  async forgotPassword(
    @Body('email') email: string,
    @Body('userType') userType: string,
  ) {
    return this.authService.forgotPassword(email, userType);
  }

  @Post('resend-otp-reset-password') // ✅ POST /auth/resend-otp
  async resendOtpForResetPassword(@Body() body: { email: string; userType: string }) {
    const { email, userType } = body;
    return this.authService.resendOtpForResetPassword(email, userType);
  }

  @Post('reset-password')
  async resetPassword(
  @Body('email') email: string,
  @Body('userType') userType: string,
  @Body('otp') otp: string,
  @Body('newPassword') newPassword: string,
) {
  return this.authService.resetPassword(email, userType, otp, newPassword);
}

@UseGuards(AuthGuard('jwt'))
  @Post('change-password')
  async changePassword(
    @Body('oldPassword') oldPassword: string,
    @Body('newPassword') newPassword: string,
    @Req() req: any, // ✅ yahan se user object milega
  ) {
    const { userId, userType } = req.user; // ✅ destructuring ab yahan karni hai
    return this.authService.changePassword(userId, userType, oldPassword, newPassword);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  async logout(@Req() req: any) {
    const { userId, userType } = req.user; // ✅ token se mila
   
    return this.authService.logout(userId, userType);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('delete-account')
  async deleteAccount(@Req() req: any) {
    const { userId, userType } = req.user; // ✅ token se mila
    return this.authService.deleteAccount(userId, userType);
  }


  @UseGuards(AuthGuard('jwt'))
  @Post('addDeleteReason')
  async AddDeleteReason(
  
    @Body('deleteReason') deleteReason: string,
    @Req() req: any, // ✅ yahan se user object milega
  ) {
    const { userId, userType } = req.user; // ✅ destructuring ab yahan karni hai
    return this.authService.addDeleteReason(userId, userType, deleteReason);
  }



@Get('issuesForDelete')
getIssuesForDelete() {
  return {
    data: [
      "Privacy concerns",
      "Inactivity",
      "Dissatisfaction with the platform or service",
      "Lack of interest in the platform or service",
      "Moving on to a different platform or service",
      "Inactivity"
    ]
  };
}

 @UseGuards(AuthGuard('jwt'))
@Post('change-notification-toggle')
async changeNotificationToggle(
  @Req() req: any,
  @Body('notificationToggle') notificationToggle: boolean,
) {
    const { userId, userType } = req.user; // ✅ destructuring ab yahan karni hai
  return this.authService.changeNotificationToggle(
    userId,
    userType,
    notificationToggle,
  );
}

@UseGuards(AuthGuard('jwt'))
@Post('updateFcmToken')
async updateFcmToken(
  @Req() req: any,
  @Body('fcmToken') fcmToken: string,
) {
  const { userId, userType } = req.user;
  return this.authService.updateFcmToken(userId, userType, fcmToken);
}

}






  // ✅ Login
//   @Post('login')
//   async login(@Body() loginDto: LoginDto) {
//     return this.authService.login(loginDto);
//   }

//   // ✅ Social Login
//   @Post('social-login')
//   async socialLogin(@Body() socialLoginDto: SocialLoginDto) {
//     return this.authService.socialLogin(socialLoginDto);
//   }
 