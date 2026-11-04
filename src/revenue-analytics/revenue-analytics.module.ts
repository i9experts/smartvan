/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { RevenueAnalyticsController } from './revenue-analytics.controller';
import { RevenueAnalyticsService } from './revenue-analytics.service';
import { BillingModule } from 'src/billing/billing.module';

@Module({
  imports: [BillingModule],
  controllers: [RevenueAnalyticsController],
  providers: [RevenueAnalyticsService],
})
export class RevenueAnalyticsModule {}
