/* eslint-disable prettier/prettier */
import { Controller, Get, Req, ForbiddenException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RevenueAnalyticsService } from './revenue-analytics.service';

@Controller('revenue-analytics')
export class RevenueAnalyticsController {
  constructor(private readonly revenueAnalyticsService: RevenueAnalyticsService) {}

  private requireSuperAdmin(req: any) {
    if (!req.user || req.user.role !== 'superadmin') {
      throw new ForbiddenException('Only superadmins can access this API');
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('overview')
  async getOverview(@Req() req: any) {
    this.requireSuperAdmin(req);
    const data = await this.revenueAnalyticsService.getOverview();
    return { message: 'Revenue analytics fetched', data };
  }
}
