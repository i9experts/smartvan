import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class WhatsappService {
  private readonly token = process.env.WHATSAPP_TOKEN;
  private readonly phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  private readonly apiUrl = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  private formatPhone(phone: string): string {
    let cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    if (!cleaned.startsWith('92') && !cleaned.startsWith('971') && !cleaned.startsWith('966') && !cleaned.startsWith('974')) {
      cleaned = '92' + cleaned;
    }
    return cleaned;
  }

  async sendTextMessage(to: string, message: string): Promise<any> {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: this.formatPhone(to),
          type: 'text',
          text: { body: message },
        },
        { headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' } }
      );
      return { success: true, data: response.data };
    } catch (e: any) {
      console.error('WhatsApp send error:', e?.response?.data);
      return { success: false, error: e?.response?.data };
    }
  }

  async sendFeeReminder(to: string, parentName: string, studentName: string, amount: number, currency: string, month: string): Promise<any> {
    const message = `Dear ${parentName},\n\nThis is a reminder that the transport fee for *${studentName}* is due.\n\n💰 Amount: *${currency} ${amount.toLocaleString()}*\n📅 Month: *${month}*\n\nPlease contact the school to arrange payment.\n\n_SmartVan - Safe Ride, Every Side_ 🚐`;
    return this.sendTextMessage(to, message);
  }

  async sendLoginCredentials(to: string, parentName: string, email: string, password: string, schoolName: string): Promise<any> {
    const message = `Dear ${parentName},\n\nWelcome to *${schoolName}* transport system powered by SmartVan! 🚐\n\nYour login credentials:\n📧 Email: *${email}*\n🔑 Password: *${password}*\n\nDownload SmartVan app to track your child's journey in real-time.\n\n_Safe Ride, Every Side_ 🌟`;
    return this.sendTextMessage(to, message);
  }

  async sendTripAlert(to: string, parentName: string, studentName: string, status: 'picked' | 'dropped', time: string): Promise<any> {
    const emoji = status === 'picked' ? '🚐' : '🏠';
    const action = status === 'picked' ? 'has been picked up' : 'has been dropped off safely';
    const message = `${emoji} Dear ${parentName},\n\n*${studentName}* ${action} at *${time}*.\n\n_SmartVan - Safe Ride, Every Side_`;
    return this.sendTextMessage(to, message);
  }

  async sendAttendanceReport(to: string, parentName: string, studentName: string, present: number, absent: number, total: number): Promise<any> {
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    const message = `📋 *Monthly Attendance Report*\n\nDear ${parentName},\n\nHere is the attendance summary for *${studentName}*:\n\n✅ Present: *${present} days*\n❌ Absent: *${absent} days*\n📊 Attendance Rate: *${rate}%*\n\n_SmartVan - Safe Ride, Every Side_ 🚐`;
    return this.sendTextMessage(to, message);
  }
}
