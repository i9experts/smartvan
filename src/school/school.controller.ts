/* eslint-disable prettier/prettier */
import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UnauthorizedException,
  Req,
  Param,
} from '@nestjs/common';
import { SchoolService } from './school.service';
import { AuthGuard } from '@nestjs/passport';
import { UseGuards } from '@nestjs/common';
import { DatabaseService } from 'src/database/databaseservice';
import { Types } from 'mongoose';

@Controller('school')
export class SchoolController {
  constructor(
    private readonly schoolService: SchoolService,
    private readonly databaseService: DatabaseService,
  ) {}

  private requireSuperadmin(user: any) {
    if (!user || user.role !== 'superadmin') {
      throw new UnauthorizedException('Only superadmins can access this API');
    }
  }

  /** Resolves the caller's own schoolId — admin via their School doc, school_staff directly. */
  private async resolveOwnSchoolId(user: any): Promise<string> {
    if (user.role === 'admin') {
      const school = await this.databaseService.repositories.SchoolModel.findOne({
        admin: new Types.ObjectId(user.userId),
      }).lean();
      if (!school) throw new UnauthorizedException('School not found for this account');
      return (school as any)._id.toString();
    }
    if (user.role === 'school_staff') {
      if (!user.schoolId) throw new UnauthorizedException('School not found for this staff account');
      return user.schoolId;
    }
    throw new UnauthorizedException('Invalid role for this action');
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('getKidsProfile')
  async getKids(@Req() req: any) {
    return this.schoolService.getkidsProfile(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('getVansProfile')
  async getVans(@Req() req: any) {
    return this.schoolService.getVansProfile(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('getDriversProfile')
  async getDrivers(@Req() req: any) {
    return this.schoolService.getDriversProfile(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('getAllSchools')
  async getAllSchools(@Req() req: any) {
    if (!req.user || req.user.role !== 'superadmin') {
      throw new UnauthorizedException('Only superadmins can access this API');
    }
    return this.schoolService.getAllSchools();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('changeSchoolStatus')
  async changeSchoolStatus(
    @Req() req: any,
    @Body() body: { schoolId: string; status: string },
  ) {
    if (req.user.role !== 'superadmin') {
      throw new UnauthorizedException('Only superadmins can access this API');
    }
    return this.schoolService.changeSchoolStatusByAdmin(body.schoolId, body.status, req.user);
  }

  @Post('register-interest')
  async registerInterest(@Body() body: any) {
    return this.schoolService.createLead(body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('leads')
  async getLeads(@Req() req: any) {
    if (req.user.role !== 'superadmin') {
      throw new UnauthorizedException('Only superadmins can access this API');
    }
    return this.schoolService.getAllLeads();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('create-institution')
  async createInstitution(
    @Req() req: any,
    @Body() body: { schoolName: string; adminName: string; email: string; phone: string; address?: string; featureTier?: 'basic' | 'premium' },
  ) {
    this.requireSuperadmin(req.user);
    return this.schoolService.createInstitutionDirectly(body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('leads/:id/status')
  async updateLeadStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    if (req.user.role !== 'superadmin') {
      throw new UnauthorizedException('Only superadmins can access this API');
    }
    return this.schoolService.updateLeadStatus(id, body.status);
  }

  // ─── Feature tier (Basic vs Premium) ──────────────────────────────────

  @UseGuards(AuthGuard('jwt'))
  @Get('feature-registry')
  getFeatureRegistry() {
    return this.schoolService.getFeatureRegistry();
  }

  /** The caller's own school's effective feature set — admin/school_staff only. */
  @UseGuards(AuthGuard('jwt'))
  @Get('my-features')
  async getMyFeatures(@Req() req: any) {
    const schoolId = await this.resolveOwnSchoolId(req.user);
    return this.schoolService.getMyFeatures(schoolId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id/features')
  async getSchoolFeatureSettings(@Req() req: any, @Param('id') id: string) {
    this.requireSuperadmin(req.user);
    return this.schoolService.getSchoolFeatureSettings(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('apps-modules-overview')
  async getAppsModulesOverview(@Req() req: any) {
    this.requireSuperadmin(req.user);
    return this.schoolService.getAppsModulesOverview();
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id/feature-tier')
  async updateSchoolFeatureTier(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { featureTier?: string; enabledFeatures?: string[]; disabledFeatures?: string[] },
  ) {
    this.requireSuperadmin(req.user);
    return this.schoolService.updateSchoolFeatureTier(id, body, req.user);
  }
}
