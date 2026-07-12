import { Module } from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsappModule],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
