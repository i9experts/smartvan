import { Module } from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { FirebaseAdminModule } from '../notification/firebase.module';

@Module({
  imports: [WhatsappModule, FirebaseAdminModule],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
