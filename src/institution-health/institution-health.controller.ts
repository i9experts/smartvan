/* eslint-disable prettier/prettier */
import { Controller, Get, Req, ForbiddenException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InstitutionHealthService } from './institution-health.service';

@Controller('institution-health')
export class InstitutionHealthController {
  constructor(private readonly institutionHealthService: InstitutionHealthService) {}

  private requireSuperAdmin(req: any) {
    if (!req.user || req.user.role !== 'superadmin') {
      throw new ForbiddenException('Only superadmins can access this API');
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('overview')
  async getOverview(@Req() req: any) {
    this.requireSuperAdmin(req);
    const data = await this.institutionHealthService.getOverview();
    return { message: 'Institution health fetched', data };
  }
}
