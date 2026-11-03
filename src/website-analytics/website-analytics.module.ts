/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { WebsiteAnalyticsController } from './website-analytics.controller';
import { WebsiteAnalyticsService } from './website-analytics.service';

@Module({
  controllers: [WebsiteAnalyticsController],
  providers: [WebsiteAnalyticsService],
})
export class WebsiteAnalyticsModule {}
