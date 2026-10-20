/* eslint-disable prettier/prettier */
import { Controller, Get, Query, Req, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UseGuards } from '@nestjs/common';
import { ParentIntelligenceService } from './parent-intelligence.service';

@Controller('parent-intelligence')
export class ParentIntelligenceController {
  constructor(private readonly parentIntelligenceService: ParentIntelligenceService) {}

  private requireSuperAdmin(req: any) {
    if (!req.user || req.user.role !== 'superadmin') {
      throw new ForbiddenException('Only superadmins can access this API');
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('overview')
  async getOverview(@Req() req: any) {
    this.requireSuperAdmin(req);
    return this.parentIntelligenceService.getOverview();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('register')
  async getRegister(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('city') city?: string,
    @Query('country') country?: string,
    @Query('district') district?: string,
    @Query('town') town?: string,
    @Query('schoolId') schoolId?: string,
    @Query('level') level?: string,
    @Query('grade') grade?: string,
    @Query('ageMin') ageMin?: string,
    @Query('ageMax') ageMax?: string,
    @Query('status') status?: 'attached' | 'prospect',
  ) {
    this.requireSuperAdmin(req);
    return this.parentIntelligenceService.getRegister({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      city,
      country,
      district,
      town,
      schoolId,
      level,
      grade,
      ageMin: ageMin ? parseInt(ageMin, 10) : undefined,
      ageMax: ageMax ? parseInt(ageMax, 10) : undefined,
      status,
    });
  }
}
