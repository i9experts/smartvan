import { Controller, Post, Body } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Controller('contact')
export class ContactController {

  @Post('send')
  async sendContact(@Body() body: any) {
    const { name, email, subject, message } = body;
    if (!name || !email || !message) {
      return { success: false, message: 'Please fill all fields' };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.hostinger.com',
        port: 587,
        secure: false,
        auth: {
          user: 'info@smartvan.pk',
          pass: process.env.SMTP_PASSWORD || 'Mnbv@777888999',
        },
      });

      await transporter.sendMail({
        from: '"SmartVan Website" <info@smartvan.pk>',
        to: 'info@smartvan.pk',
        replyTo: email,
        subject: `[SmartVan Contact] ${subject || 'General Inquiry'} — ${name}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#1B2B6B;padding:20px;border-radius:8px 8px 0 0">
              <h2 style="color:white;margin:0">New Contact Form Submission</h2>
              <p style="color:rgba(255,255,255,0.7);margin:5px 0 0">SmartVan Marketing Website</p>
            </div>
            <div style="background:#f8f9fc;padding:24px;border-radius:0 0 8px 8px">
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;width:120px">Name:</td><td style="padding:8px 0;font-weight:600;color:#1a1a2e">${name}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Email:</td><td style="padding:8px 0;font-weight:600;color:#1B2B6B"><a href="mailto:${email}">${email}</a></td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Subject:</td><td style="padding:8px 0;font-weight:600;color:#1a1a2e">${subject || 'General Inquiry'}</td></tr>
              </table>
              <div style="margin-top:16px;padding:16px;background:white;border-radius:8px;border-left:4px solid #1B2B6B">
                <p style="color:#6b7280;font-size:12px;margin:0 0 8px">Message:</p>
                <p style="color:#1a1a2e;font-size:14px;line-height:1.6;margin:0">${message.replace(/\n/g, '<br>')}</p>
              </div>
              <div style="margin-top:20px;padding:12px;background:#FFB800;border-radius:8px;text-align:center">
                <a href="mailto:${email}" style="color:#1B2B6B;font-weight:700;text-decoration:none">Reply to ${name} →</a>
              </div>
            </div>
          </div>
        `,
      });

      return { success: true, message: 'Message sent successfully!' };
    } catch (e: any) {
      console.error('Contact form error:', e);
      return { success: false, message: 'Failed to send message. Please try again.' };
    }
  }
}
