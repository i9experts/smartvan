import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class WhatsappService {
  private readonly token = process.env.WHATSAPP_TOKEN;
  private readonly phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  private readonly apiUrl = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  // Send using school's own WhatsApp credentials
  async sendWithSchoolCredentials(phoneNumberId: string, accessToken: string, to: string, message: string): Promise<any> {
    try {
      const cleaned = this.formatPhone(to);
      const response = await axios.post(
        `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleaned,
          type: 'text',
          text: { body: message },
        },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
      );
      return { success: true, data: response.data };
    } catch (e: any) {
      console.error('WhatsApp school send error:', e?.response?.data);
      return { success: false, error: e?.response?.data };
    }
  }

  private formatPhone(phone: string): string {
    let cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    if (!cleaned.startsWith('92') && !cleaned.startsWith('971') && !cleaned.startsWith('966') && !cleaned.startsWith('974')) {
      cleaned = '92' + cleaned;
    }
    return cleaned;
  }

  async sendTemplateMessage(to: string, parentName: string, message: string): Promise<any> {
    try {
      const cleaned = this.formatPhone(to);
      const response = await axios.post(
        this.apiUrl,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleaned,
          type: 'template',
          template: {
            name: 'smartvan_alert',
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: parentName || 'Parent' },
                  { type: 'text', text: message },
                ],
              },
            ],
          },
        },
        { headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' } }
      );
      return { success: true, data: response.data };
    } catch (e: any) {
      console.error('WhatsApp template send error:', e?.response?.data);
      return { success: false, error: e?.response?.data };
    }
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
    const message = `Transport fee for ${studentName} is due. Amount: ${currency} ${amount.toLocaleString()} for ${month}. Please contact the school to arrange payment.`;
    return this.sendTemplateMessage(to, parentName, message);
  }

  async sendLoginCredentials(to: string, parentName: string, email: string, password: string, schoolName: string): Promise<any> {
    const message = `Dear ${parentName},\n\nWelcome to *${schoolName}* transport system powered by SmartVan! 🚐\n\nYour login credentials:\n📧 Email: *${email}*\n🔑 Password: *${password}*\n\nDownload SmartVan app to track your child's journey in real-time.\n\n_Safe Ride, Every Side_ 🌟`;
    return this.sendTextMessage(to, message);
  }

  async sendTripAlert(to: string, parentName: string, studentName: string, status: 'picked' | 'dropped', time: string): Promise<any> {
    const action = status === 'picked' ? 'has been picked up' : 'has been dropped off safely';
    const message = `${studentName} ${action} at ${time}.`;
    return this.sendTemplateMessage(to, parentName, message);
  }

  async sendSchoolWelcome(to: string, contactPerson: string, schoolName: string): Promise<any> {
    try {
      const response = await axios.post(this.apiUrl, {
        messaging_product: 'whatsapp',
        to: this.formatPhone(to),
        type: 'template',
        template: {
          name: 'smartvan_welcome',
          language: { code: 'en' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: contactPerson },
              { type: 'text', text: schoolName },
            ],
          }],
        },
      }, { headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' } });
      return { success: true, data: response.data };
    } catch (e: any) { return { success: false, error: e?.response?.data }; }
  }

  async sendParentWelcome(to: string, parentName: string, studentName: string, schoolName: string): Promise<any> {
    try {
      const response = await axios.post(this.apiUrl, {
        messaging_product: 'whatsapp',
        to: this.formatPhone(to),
        type: 'template',
        template: {
          name: 'smartvan_parent_welcome',
          language: { code: 'en' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: parentName },
              { type: 'text', text: studentName },
              { type: 'text', text: schoolName },
            ],
          }],
        },
      }, { headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' } });
      return { success: true, data: response.data };
    } catch (e: any) { return { success: false, error: e?.response?.data }; }
  }

  async sendDriverWelcome(to: string, driverName: string, schoolName: string, vanNumber: string): Promise<any> {
    try {
      const response = await axios.post(this.apiUrl, {
        messaging_product: 'whatsapp',
        to: this.formatPhone(to),
        type: 'template',
        template: {
          name: 'smartvan_driver_welcome',
          language: { code: 'en' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: driverName },
              { type: 'text', text: schoolName },
              { type: 'text', text: vanNumber },
            ],
          }],
        },
      }, { headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' } });
      return { success: true, data: response.data };
    } catch (e: any) { return { success: false, error: e?.response?.data }; }
  }

  async sendFeeReminderTemplate(to: string, parentName: string, studentName: string, month: string, amount: string): Promise<any> {
    try {
      const response = await axios.post(this.apiUrl, {
        messaging_product: 'whatsapp',
        to: this.formatPhone(to),
        type: 'template',
        template: {
          name: 'smartvan_fee_reminder',
          language: { code: 'en' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: parentName },
              { type: 'text', text: studentName },
              { type: 'text', text: month },
              { type: 'text', text: amount },
            ],
          }],
        },
      }, { headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' } });
      return { success: true, data: response.data };
    } catch (e: any) { return { success: false, error: e?.response?.data }; }
  }

  async sendSosAlert(to: string, parentName: string, studentName: string, vanNumber: string, schoolPhone: string): Promise<any> {
    try {
      const response = await axios.post(this.apiUrl, {
        messaging_product: 'whatsapp',
        to: this.formatPhone(to),
        type: 'template',
        template: {
          name: 'smartvan_sos',
          language: { code: 'en' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: parentName },
              { type: 'text', text: studentName },
              { type: 'text', text: vanNumber },
              { type: 'text', text: schoolPhone },
            ],
          }],
        },
      }, { headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' } });
      return { success: true, data: response.data };
    } catch (e: any) { return { success: false, error: e?.response?.data }; }
  }

  async sendAttendanceReport(to: string, parentName: string, studentName: string, present: number, absent: number, total: number): Promise<any> {
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    const message = `📋 *Monthly Attendance Report*\n\nDear ${parentName},\n\nHere is the attendance summary for *${studentName}*:\n\n✅ Present: *${present} days*\n❌ Absent: *${absent} days*\n📊 Attendance Rate: *${rate}%*\n\n_SmartVan - Safe Ride, Every Side_ 🚐`;
    return this.sendTextMessage(to, message);
  }
}
