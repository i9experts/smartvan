/* eslint-disable prettier/prettier */
import { Controller, Get, Query, Req, ForbiddenException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WebsiteAnalyticsService } from './website-analytics.service';

@Controller('website-analytics')
export class WebsiteAnalyticsController {
  constructor(private readonly websiteAnalyticsService: WebsiteAnalyticsService) {}

  private requireSuperAdmin(req: any) {
    if (!req.user || req.user.role !== 'superadmin') {
      throw new ForbiddenException('Only superadmins can access this API');
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('overview')
  async getOverview(@Req() req: any, @Query('days') days?: string) {
    this.requireSuperAdmin(req);
    const parsed = Number(days);
    const rangeDays = Number.isFinite(parsed) && parsed > 0 && parsed <= 90 ? parsed : 28;
    const data = await this.websiteAnalyticsService.getOverview(rangeDays);
    return { message: 'Website analytics fetched', data };
  }
}
