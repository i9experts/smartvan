import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from 'src/database/databaseservice';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { FirebaseAdminService } from '../notification/firebase-admin.service';
import { Types } from 'mongoose';
import { DRIVER_ALERT_DAYS, DRIVER_DOC_FIELDS, daysUntil } from './driver-docs.util';

const ALERT_WINDOWS = [30, 15, 7];
const DOC_FIELDS: { field: string; label: string }[] = [
  { field: 'insuranceExpiry', label: 'Insurance' },
  { field: 'registrationExpiry', label: 'Registration' },
  { field: 'fitnessExpiry', label: 'Fitness Certificate' },
  { field: 'routePermitExpiry', label: 'Route Permit' },
];

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private databaseService: DatabaseService,
    private whatsappService: WhatsappService,
    private firebaseAdminService: FirebaseAdminService,
  ) {}

  // Runs once daily at 8:00 AM server time
  @Cron('0 8 * * *')
  async checkComplianceExpiries() {
    return this.runComplianceCheck();
  }

  // Extracted so it can be triggered manually for testing
  async runComplianceCheck() {
    this.logger.log('Running daily compliance expiry check...');
    const vans = await this.databaseService.repositories.VanModel.find({
      status: 'active',
      $or: DOC_FIELDS.map(d => ({ [d.field]: { $exists: true, $ne: null } })),
    });

    const now = new Date();
    let alertsSent = 0;

    for (const van of vans) {
      if (!van.schoolId) continue;
      const school = await this.databaseService.repositories.SchoolModel.findById(van.schoolId);
      if (!school || !school.contactNumber) continue;

      for (const doc of DOC_FIELDS) {
        const expiryValue = (van as any)[doc.field];
        if (!expiryValue) continue;

        const expiryDate = new Date(expiryValue);
        const daysLeft = Math.floor((expiryDate.getTime() - now.getTime()) / 86400000);

        if (ALERT_WINDOWS.includes(daysLeft)) {
          const message = `⚠️ Compliance Alert\n\nVan *${van.carNumber || van._id}*'s *${doc.label}* expires in *${daysLeft} day(s)* (${expiryDate.toDateString()}).\n\nPlease renew it in time to avoid service disruption.\n\n_SmartVan Compliance Centre_`;

          try {
            if (school.waConnected && school.waPhoneNumberId && school.waAccessToken) {
              await this.whatsappService.sendWithSchoolCredentials(
                school.waPhoneNumberId,
                school.waAccessToken,
                school.contactNumber,
                message,
              );
            } else {
              await this.whatsappService.sendTextMessage(school.contactNumber, message);
            }
            alertsSent++;
          } catch (e) {
            this.logger.error(`Failed to send compliance alert for van ${van._id}`, e);
          }
        }
      }
    }

    this.logger.log(`Compliance check complete. Alerts sent: ${alertsSent}`);
    await this.runDriverDocsCheck();
  }

  /**
   * Driver's own documents (licence, vehicle card): push to the driver and
   * an ADMIN alert for their school at 30/15/7/1 days and on the expiry day.
   */
  async runDriverDocsCheck(now: Date = new Date()) {
    const repos = this.databaseService.repositories;
    const drivers: any[] = await repos.driverModel.find(
      {
        isDelete: { $ne: true },
        $or: DRIVER_DOC_FIELDS.map(d => ({ [d.field]: { $exists: true, $nin: [null, ''] } })),
      },
      { fullname: 1, fcmToken: 1, expiryDateLicense: 1, expiryDateVehicleCard: 1 },
    ).lean();

    let sent = 0;
    for (const driver of drivers) {
      const due = DRIVER_DOC_FIELDS
        .map(d => ({ ...d, days: daysUntil(driver[d.field], now) }))
        .filter(d => d.days !== null && DRIVER_ALERT_DAYS.includes(d.days));
      if (!due.length) continue;

      const van: any = await repos.VanModel.findOne(
        { driverId: new Types.ObjectId(driver._id) }, { schoolId: 1, carNumber: 1 },
      ).lean();
      for (const doc of due) {
        const when = doc.days === 0 ? 'expires today' : `expires in ${doc.days} day${doc.days === 1 ? '' : 's'}`;
        try {
          if (driver.fcmToken) {
            await this.firebaseAdminService.sendToDevice(driver.fcmToken, {
              notification: { title: `${doc.label} ${when}`, body: 'Please renew it and upload the new copy in the app.' },
              data: { type: 'DOCUMENT_EXPIRY', field: doc.field, daysLeft: String(doc.days) },
            });
          }
          if (van?.schoolId) {
            await repos.notificationModel.create({
              type: 'document_expiry', alertType: 'DOCUMENT_EXPIRY', recipientType: 'ADMIN', infoType: 'Warning',
              driverId: driver._id.toString(), schoolId: van.schoolId, VanId: van._id.toString(),
              title: 'Driver document expiring',
              message: `${driver.fullname || 'Driver'}${van.carNumber ? ` (van ${van.carNumber})` : ''}: ${doc.label} ${when}.`,
              status: 'sent', date: now,
            });
          }
          sent++;
        } catch (e) {
          this.logger.error(`Driver doc alert failed for ${driver._id}`, e);
        }
      }
    }
    this.logger.log(`Driver document check complete. Alerts sent: ${sent}`);
  }
}
