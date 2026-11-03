import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { SchoolModule } from 'src/school/school.module';

@Module({
  imports: [AuditLogModule, SchoolModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
