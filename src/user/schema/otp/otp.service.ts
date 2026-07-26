/* eslint-disable prettier/prettier */
// import { Injectable, Logger } from '@nestjs/common';
// import * as nodemailer from 'nodemailer';

// @Injectable()
// export class OtpService {
//   private transporter: nodemailer.Transporter;
//   private readonly logger = new Logger(OtpService.name);

//   constructor() {
//     this.transporter = nodemailer.createTransport({
//       service: 'gmail',
//       auth: {
//         user: 'farazahmed.fa276@gmail.com',        // 🟢 apna Gmail daalo yahan
//         pass: 'saqqwgcfseysoikf',               // 🟢 Gmail app password without spaces
//       },
//     });
//   }

  // async sendOtp(toEmail: string, otp: string): Promise<void> {
  //   try {
  //     const mailOptions = {
  //       from: 'farazahmed.fa276@gmail.com',  
  //       to: toEmail,
  //       subject: 'Your OTP Code',
  //       text: `Your OTP code is: ${otp}`,
  //       html: `<p>Your OTP code is: <b>${otp}</b></p>`, 
  //     };

     
  //     const result = await this.transporter.sendMail(mailOptions);

      
  //     this.logger.log(`OTP email sent to ${toEmail}: ${result.response}`);
  //   } catch (error) {
  //     // Log error
  //     this.logger.error(`Failed to send OTP to ${toEmail}`, error);
  //     throw new Error('Failed to send OTP email');
  //   }
  // }

//   async sendOtp(toEmail: string, otp: string): Promise<void> {
//   try {
//     // HTML email content
//     const emailHtml = `
//     <!DOCTYPE html>
//     <html>
//     <head>
//     <meta charset="UTF-8">
//     <title>Verify Your Account</title>
//     </head>
//     <body style="margin:0; padding:0; background-color:#f4f6f9; font-family:Arial, sans-serif;">
    
//     <table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:30px auto; background:#ffffff; border-radius:8px; overflow:hidden;">
      
//       <!-- Header -->
//       <tr>
//         <td style="background: linear-gradient(90deg, #36c3b5, #4a67f5); padding:30px 30px 20px 30px; color:#ffffff;">
//           <h1 style="margin:0; font-size:28px; font-weight:bold;">Verify Your Account</h1>
//           <p style="margin:8px 0 0 0; font-size:14px;">Please use the OTP to verify your account</p>
//         </td>
//       </tr>
    
//       <!-- Body -->
//       <tr>
//         <td style="padding:30px; color:#333333;">
    
//           <p style="font-size:14px; margin-top:0;">
//             Please use the following One Time Password (OTP) to verify your account:
//           </p>
    
//           <!-- OTP -->
//           <div style="text-align:center; margin:25px 0;">
//             <span style="font-size:36px; letter-spacing:8px; font-weight:bold; color:#1a1a1a;">
//               ${otp}
//             </span>
//           </div>
    
//           <!-- Info Box -->
//           <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f7; border-radius:8px; padding:15px; margin-bottom:20px;">
//             <tr>
//               <td style="font-size:14px; padding:5px 0;">
//                 <strong>Valid For :</strong> 10 minutes
//               </td>
//             </tr>
//             <tr>
//               <td style="font-size:14px; padding:5px 0;">
//                 <strong>Request Time :</strong> ${new Date().toLocaleString()}
//               </td>
//             </tr>
//           </table>
    
//           <p style="font-size:13px; color:#666666; line-height:1.6;">
//             This OTP is valid for the next 10 minutes. Please do not share this code with anyone.
//           </p>
    
//           <p style="font-size:13px; color:#666666; line-height:1.6;">
//             If you didn't request this verification, please ignore this email or contact our support team immediately.
//           </p>
    
//         </td>
//       </tr>
    
//       <!-- Footer -->
//    <tr>
//   <td style="padding:20px 30px; text-align:center; font-size:12px; color:#999999; border-top:1px solid #eeeeee;">
//     SmartVan · 
//     <a href="mailto:smartvaninfo@example.com" style="color:#4a67f5; text-decoration:none;">
//       smartvaninfo@example.com
//     </a>
//     <br><br>
//     © 2026 SmartVan. All rights reserved.
//   </td>
// </tr>
    
//     </table>
    
//     </body>
//     </html>
//     `;

//     // Mail options with HTML content
//     const mailOptions = {
//       from: 'farazahmed.fa276@gmail.com',
//       to: toEmail,
//       subject: 'Your OTP Code',
//       text: `Your OTP code is: ${otp}`,
//       html: emailHtml, // Set HTML content
//     };

//     // Send the email
//     const result = await this.transporter.sendMail(mailOptions);

//     // Log the result
//     this.logger.log(`OTP email sent to ${toEmail}: ${result.response}`);
//   } catch (error) {
//     // Log error
//     this.logger.error(`Failed to send OTP to ${toEmail}`, error);
//     throw new Error('Failed to send OTP email');
//   }
// }

// async sendPassword(toEmail: string, password: string): Promise<void> {
//   try {
//     const mailOptions = {
//       from: 'farazahmed.fa276@gmail.com',
//       to: toEmail,
//       subject: 'Your Password',
//       text: `Your password is: ${password}

// `,
//     html: `
//   <div style="font-family: Arial, sans-serif; line-height:1.6; max-width: 560px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; background:#ffffff;">
    
//     <!-- App / System Heading -->
//     <h1 style="text-align:center; color:#4f46e5; margin-bottom:4px;">
//       Smart Van
//     </h1>
//     <p style="text-align:center; color:#666; font-size:14px; margin-top:0;">
//       School Management System
//     </p>

//     <hr style="border:none; border-top:1px solid #eee; margin:20px 0;" />

//     <!-- Login Heading -->
//     <h2 style="text-align:center; color:#333;">Login to Your Account</h2>

//     <p>Your admin account has been created successfully. Use the credentials below to log in.</p>

//     <!-- Credentials Box -->
//     <div style="background:#f7f7f7; padding:16px; border-radius:6px; margin:16px 0;">
//       <p style="margin:6px 0;"><b>Email:</b> ${toEmail}</p>
//       <p style="margin:6px 0;"><b>Password:</b> ${password}</p>
//     </div>

//     <!-- Login Button -->
//     <div style="text-align:center; margin:24px 0;">
//       <a href="https://smartvanride.com/auth/signin"
//          style="background:#4f46e5; color:#fff; padding:12px 24px; text-decoration:none; border-radius:6px; display:inline-block;">
//         Login Now
//       </a>
//     </div>

//     <p style="font-size:14px;">
//       After logging in, we recommend changing your password from your profile settings.
//     </p>

//     <p style="color:#777; font-size:12px; margin-top:16px;">
//       If you did not expect this email, you can safely ignore it.
//     </p>
//   </div>
// `
// ,
//     };

//     const result = await this.transporter.sendMail(mailOptions);
//     this.logger.log(`✅ Temporary password sent to ${toEmail}: ${result.response}`);
//   } catch (error) {
//     this.logger.error(`❌ Failed to send temporary password to ${toEmail}`, error);
//     throw new Error('Failed to send temporary password email');
//   }
// }

// async sendPassword(toEmail: string, password: string): Promise<void> {
//   try {
//     const emailHtml = `
//     <!DOCTYPE html>
//     <html>
//     <head>
//       <meta charset="UTF-8">
//       <title>Your Account Password</title>
//     </head>
//     <body style="margin:0; padding:0; background-color:#f4f6f9; font-family:Arial, sans-serif;">

//       <table align="center" width="100%" cellpadding="0" cellspacing="0"
//         style="max-width:600px; margin:30px auto; background:#ffffff; border-radius:8px; overflow:hidden;">

//         <!-- Header -->
//         <tr>
//           <td style="background: linear-gradient(90deg, #36c3b5, #4a67f5); padding:30px; color:#ffffff;">
//             <h1 style="margin:0; font-size:28px;">Welcome to SmartVan</h1>
//             <p style="margin:8px 0 0 0; font-size:14px;">
//               Your account has been created successfully
//             </p>
//           </td>
//         </tr>

//         <!-- Body -->
//         <tr>
//           <td style="padding:30px; color:#333333;">

//             <p style="font-size:14px;">
//               Your admin account has been created. Please use the password below to log in:
//             </p>

//             <!-- Password Box -->
//             <div style="text-align:center; margin:25px 0;">
//               <span style="font-size:28px; letter-spacing:3px; font-weight:bold; color:#1a1a1a;">
//                 ${password}
//               </span>
//             </div>

//             <!-- Info Box -->
//             <table width="100%" cellpadding="0" cellspacing="0"
//               style="background:#f2f4f7; border-radius:8px; padding:15px; margin-bottom:20px;">
//               <tr>
//                 <td style="font-size:14px; padding:5px 0;">
//                   <strong>Email :</strong> ${toEmail}
//                 </td>
//               </tr>
//               <tr>
//                 <td style="font-size:14px; padding:5px 0;">
//                   <strong>Generated At :</strong> ${new Date().toLocaleString()}
//                 </td>
//               </tr>
//             </table>

//             <!-- Login Button -->
//             <div style="text-align:center; margin:30px 0;">
//               <a href="https://smartvanride.com/auth/signin"
//                  style="background:#4a67f5; color:#ffffff; padding:12px 26px;
//                         text-decoration:none; border-radius:6px; font-size:14px;">
//                 Login Now
//               </a>
//             </div>

//             <p style="font-size:13px; color:#666666; line-height:1.6;">
//               For security reasons, we recommend changing your password after logging in.
//             </p>

//             <p style="font-size:13px; color:#666666; line-height:1.6;">
//               If you did not expect this email, please contact our support team immediately.
//             </p>

//           </td>
//         </tr>

//         <!-- Footer -->
//         <tr>
//           <td style="padding:20px 30px; text-align:center; font-size:12px;
//                      color:#999999; border-top:1px solid #eeeeee;">
//             SmartVan ·
//             <a href="mailto:smartvaninfo@example.com"
//                style="color:#4a67f5; text-decoration:none;">
//               smartvaninfo@example.com
//             </a>
//             <br><br>
//             © 2026 SmartVan. All rights reserved.
//           </td>
//         </tr>

//       </table>

//     </body>
//     </html>
//     `;

//     const mailOptions = {
//       from: 'farazahmed.fa276@gmail.com',
//       to: toEmail,
//       subject: 'Your Account Password',
//       text: `Your password is: ${password}`,
//       html: emailHtml,
//     };

//     const result = await this.transporter.sendMail(mailOptions);
//     this.logger.log(`Password email sent to ${toEmail}: ${result.response}`);

//   } catch (error) {
//     this.logger.error(`Failed to send password to ${toEmail}`, error);
//     throw new Error('Failed to send password email');
//   }
// }

// }


/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OtpService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(OtpService.name);

   constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('EMAIL_HOST'),
      port: Number(this.configService.get<string>('EMAIL_PORT')),
      secure: false,
      auth: {
        user: this.configService.get<string>('EMAIL_USER'),
        pass: this.configService.get<string>('EMAIL_PASS'),
      },
    });
  

    
    this.transporter.verify()
      .then(() => this.logger.log('✅ SMTP ready'))
      .catch(err => this.logger.error('❌ SMTP error', err));
  }

  // async sendOtp(toEmail: string, otp: string): Promise<void> {
  //   try {
  //     const mailOptions = {
  //       from: 'Smart Van <info@smartvan.pk>',
  //       to: toEmail,
  //       subject: 'Your OTP Code',
  //       text: `Your OTP code is: ${otp}`,
  //       html: `<p>Your OTP code is: <b>${otp}</b></p>`,
  //     };

  //     const result = await this.transporter.sendMail(mailOptions);
  //     this.logger.log(`OTP email sent to ${toEmail}: ${result.response}`);

  //   } catch (error) {
  //     this.logger.error(`Failed to send OTP to ${toEmail}`, error);
  //     throw new Error('Failed to send OTP email');
  //   }
  // }


    async sendOtp(toEmail: string, otp: string): Promise<void> {
  try {
    // HTML email content
    const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="UTF-8">
    <title>Verify Your Account</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f4f6f9; font-family:Arial, sans-serif;">
    
    <table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:30px auto; background:#ffffff; border-radius:8px; overflow:hidden;">
      
      <!-- Header -->
      <tr>
        <td style="background: linear-gradient(90deg, #36c3b5, #4a67f5); padding:30px 30px 20px 30px; color:#ffffff;">
          <h1 style="margin:0; font-size:28px; font-weight:bold;">Verify Your Account</h1>
          <p style="margin:8px 0 0 0; font-size:14px;">Please use the OTP to verify your account</p>
        </td>
      </tr>
    
      <!-- Body -->
      <tr>
        <td style="padding:30px; color:#333333;">
    
          <p style="font-size:14px; margin-top:0;">
            Please use the following One Time Password (OTP) to verify your account:
          </p>
    
          <!-- OTP -->
          <div style="text-align:center; margin:25px 0;">
            <span style="font-size:36px; letter-spacing:8px; font-weight:bold; color:#1a1a1a;">
              ${otp}
            </span>
          </div>
    
          <!-- Info Box -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f7; border-radius:8px; padding:15px; margin-bottom:20px;">
            <tr>
              <td style="font-size:14px; padding:5px 0;">
                <strong>Valid For :</strong> 10 minutes
              </td>
            </tr>
            <tr>
              <td style="font-size:14px; padding:5px 0;">
                <strong>Request Time :</strong> ${new Date().toLocaleString()}
              </td>
            </tr>
          </table>
    
          <p style="font-size:13px; color:#666666; line-height:1.6;">
            This OTP is valid for the next 10 minutes. Please do not share this code with anyone.
          </p>
    
          <p style="font-size:13px; color:#666666; line-height:1.6;">
            If you didn't request this verification, please ignore this email or contact our support team immediately.
          </p>
    
        </td>
      </tr>
    
      <!-- Footer -->
   <tr>
  <td style="padding:20px 30px; text-align:center; font-size:12px; color:#999999; border-top:1px solid #eeeeee;">
    SmartVan · 
    <a href="mailto:info@smartvan.pk" style="color:#4a67f5; text-decoration:none;">
      info@smartvan.pk
    </a>
    <br><br>
    © 2026 SmartVan. All rights reserved.
  </td>
</tr>
    
    </table>
    
    </body>
    </html>
    `;

    // Mail options with HTML content
    const mailOptions = {
      from: 'Smart Van <info@smartvan.pk>',
        to: toEmail,
        subject: 'Your OTP Code',
        text: `Your OTP code is: ${otp}`,
      html: emailHtml, // Set HTML content
    };

    // Send the email
    const result = await this.transporter.sendMail(mailOptions);

    // Log the result
    this.logger.log(`OTP email sent to ${toEmail}: ${result.response}`);
  } catch (error) {
    // Log error
    this.logger.error(`Failed to send OTP to ${toEmail}`, error);
    throw new Error('Failed to send OTP email');
  }
}

async sendPassword(toEmail: string, password: string, accountType: 'admin' | 'parent' = 'admin'): Promise<void> {
  try {
    const isParent = accountType === 'parent';
    const introText = isParent
      ? 'Your parent account has been created. Please use the password below to log in from the SmartVan mobile app:'
      : 'Your admin account has been created. Please use the password below to log in:';

    // Parents use the mobile app, not the admin web panel — a "Login Now"
    // button pointing at the admin panel would land them on a login page
    // for a product they can't actually use. Point them at the app instead.
    const actionHtml = isParent
      ? `
            <div style="text-align:center; margin:30px 0;">
              <p style="font-size:14px; color:#1a1a1a; font-weight:600; margin:0 0 6px;">
                Open the SmartVan app on your phone to log in
              </p>
              <p style="font-size:13px; color:#666666; margin:0;">
                Use your email and the password above
              </p>
            </div>`
      : `
            <div style="text-align:center; margin:30px 0;">
              <a href="https://app.smartvan.pk/auth/login"
                 style="background:#4a67f5; color:#ffffff; padding:12px 26px;
                        text-decoration:none; border-radius:6px; font-size:14px;">
                Login Now
              </a>
            </div>`;

    const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Your Account Password</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f4f6f9; font-family:Arial, sans-serif;">

      <table align="center" width="100%" cellpadding="0" cellspacing="0"
        style="max-width:600px; margin:30px auto; background:#ffffff; border-radius:8px; overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background: linear-gradient(90deg, #36c3b5, #4a67f5); padding:30px; color:#ffffff;">
            <h1 style="margin:0; font-size:28px;">Welcome to SmartVan</h1>
            <p style="margin:8px 0 0 0; font-size:14px;">
              Your account has been created successfully
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:30px; color:#333333;">

            <p style="font-size:14px;">
              ${introText}
            </p>

            <!-- Password Box -->
            <div style="text-align:center; margin:25px 0;">
              <span style="font-size:28px; letter-spacing:3px; font-weight:bold; color:#1a1a1a;">
                ${password}
              </span>
            </div>

            <!-- Info Box -->
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:#f2f4f7; border-radius:8px; padding:15px; margin-bottom:20px;">
              <tr>
                <td style="font-size:14px; padding:5px 0;">
                  <strong>Email :</strong> ${toEmail}
                </td>
              </tr>
              <tr>
                <td style="font-size:14px; padding:5px 0;">
                  <strong>Generated At :</strong> ${new Date().toLocaleString()}
                </td>
              </tr>
            </table>

            ${actionHtml}

            <p style="font-size:13px; color:#666666; line-height:1.6;">
              For security reasons, we recommend changing your password after logging in.
            </p>

            <p style="font-size:13px; color:#666666; line-height:1.6;">
              If you did not expect this email, please contact our support team immediately.
            </p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 30px; text-align:center; font-size:12px;
                     color:#999999; border-top:1px solid #eeeeee;">
            SmartVan ·
            <a href="mailto:info@smartvan.pk"
               style="color:#4a67f5; text-decoration:none;">
              info@smartvan.pk
            </a>
            <br><br>
            © 2026 SmartVan. All rights reserved.
          </td>
        </tr>

      </table>

    </body>
    </html>
    `;

 const mailOptions = {
      from: 'Smart Van <info@smartvan.pk>',
      to: toEmail,
      subject: 'Your Account Password',
      text: `Your password is: ${password}`,
      html: emailHtml,
    };

    const result = await this.transporter.sendMail(mailOptions);
    this.logger.log(`Password email sent to ${toEmail}: ${result.response}`);

  } catch (error) {
    this.logger.error(`Failed to send password to ${toEmail}`, error);
    throw new Error('Failed to send password email');
  }
}

  // async sendPassword(toEmail: string, password: string): Promise<void> {
  //   try {
  //     const mailOptions = {
  //       from: 'Smart Van <info@smartvan.pk>',
  //       to: toEmail,
  //       subject: 'Your Password',
  //       text: `Your password is: ${password}`,
  //       html: `
  //       <div style="font-family: Arial, sans-serif; line-height:1.6; max-width: 560px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; background:#ffffff;">
          
  //         <h1 style="text-align:center; color:#4f46e5;">Smart Van</h1>
  //         <p style="text-align:center; color:#666;">School Management System</p>

  //         <hr style="border-top:1px solid #eee;" />

  //         <h2 style="text-align:center;">Login to Your Account</h2>

  //         <p>Your admin account has been created successfully.</p>

  //         <div style="background:#f7f7f7; padding:16px; border-radius:6px;">
  //           <p><b>Email:</b> ${toEmail}</p>
  //           <p><b>Password:</b> ${password}</p>
  //         </div>

  //         <div style="text-align:center; margin:20px 0;">
  //           <a href="https://smartvanride.com/auth/signin"
  //              style="background:#4f46e5; color:#fff; padding:12px 24px; text-decoration:none; border-radius:6px;">
  //             Login Now
  //           </a>
  //         </div>

  //         <p>We recommend changing your password after login.</p>

  //         <p style="color:#777; font-size:12px;">
  //           If you did not expect this email, ignore it.
  //         </p>
  //       </div>
  //       `,
  //     };

  //     const result = await this.transporter.sendMail(mailOptions);
  //     this.logger.log(`✅ Password email sent to ${toEmail}: ${result.response}`);

  //   } catch (error) {
  //     this.logger.error(`❌ Failed to send password to ${toEmail}`, error);
  //     throw new Error('Failed to send password email');
  //   }
  // }


}

