import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from 'src/database/databaseservice';
import { WhatsappService } from '../whatsapp/whatsapp.service';

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
  }
}
