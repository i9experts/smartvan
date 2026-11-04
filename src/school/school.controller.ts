/* eslint-disable prettier/prettier */
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
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

  // Leads are also worked by sales employees (manage_leads permission),
  // not just superadmin — ownership of a specific lead is then enforced
  // inside SchoolService (assertLeadAccess), not here.
  private requireSalesAccess(user: any) {
    if (!user) throw new UnauthorizedException('Not authenticated');
    if (user.role === 'superadmin') return;
    if (user.role === 'employee' && (user.permissions || []).includes('manage_leads')) return;
    throw new UnauthorizedException('Only superadmins and sales employees can access this API');
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
    this.requireSalesAccess(req.user);
    return this.schoolService.getAllLeads({ userId: req.user.userId, role: req.user.role });
  }

  // Static routes — must stay registered before 'leads/:id' or Nest would
  // match "email-templates"/"import"/"leaderboard" as an :id instead.
  @UseGuards(AuthGuard('jwt'))
  @Get('leads/email-templates')
  async getLeadEmailTemplates(@Req() req: any) {
    this.requireSalesAccess(req.user);
    return this.schoolService.getLeadEmailTemplates();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('leads/leaderboard')
  async getLeaderboard(@Req() req: any) {
    this.requireSalesAccess(req.user);
    return this.schoolService.getLeaderboard();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('leads/forecast')
  async getSalesForecast(@Req() req: any) {
    this.requireSalesAccess(req.user);
    return this.schoolService.getSalesForecast();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('leads')
  async createLead_Manual(@Req() req: any, @Body() body: any) {
    this.requireSalesAccess(req.user);
    return this.schoolService.createLeadManually(body, { userId: req.user.userId, email: req.user.email, role: req.user.role });
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('leads/import')
  async importLeads(@Req() req: any, @Body() body: { rows: any[] }) {
    this.requireSuperadmin(req.user);
    return this.schoolService.importLeads(body.rows, { email: req.user.email });
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('leads/sync-stalled-schools')
  async syncStalledSchools(@Req() req: any) {
    this.requireSuperadmin(req.user);
    return this.schoolService.syncStalledSchoolsIntoPipeline();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('leads/:id')
  async getLead(@Req() req: any, @Param('id') id: string) {
    this.requireSalesAccess(req.user);
    return this.schoolService.getLeadById(id, { userId: req.user.userId, role: req.user.role });
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('leads/:id/activity')
  async addLeadActivity(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { type: string; summary: string },
  ) {
    this.requireSalesAccess(req.user);
    return this.schoolService.addLeadActivity(id, body, { userId: req.user.userId, email: req.user.email, role: req.user.role });
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('leads/:id/tasks')
  async addLeadTask(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { title: string; dueAt?: string },
  ) {
    this.requireSalesAccess(req.user);
    return this.schoolService.addLeadTask(id, body, { userId: req.user.userId, role: req.user.role });
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('leads/:id/tasks/:taskId')
  async updateLeadTask(
    @Req() req: any,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() body: { done?: boolean; title?: string; dueAt?: string },
  ) {
    this.requireSalesAccess(req.user);
    return this.schoolService.updateLeadTask(id, taskId, body, { userId: req.user.userId, role: req.user.role });
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('leads/:id/send-email')
  async sendLeadEmail(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { subject: string; body: string },
  ) {
    this.requireSalesAccess(req.user);
    return this.schoolService.sendLeadEmail(id, body, { userId: req.user.userId, email: req.user.email, role: req.user.role });
  }

  // Assignment stays a superadmin decision — reps work the leads they're
  // given, they don't reassign their own to someone else.
  @UseGuards(AuthGuard('jwt'))
  @Patch('leads/:id/assign')
  async assignLead(@Req() req: any, @Param('id') id: string, @Body() body: { employeeId: string | null }) {
    this.requireSuperadmin(req.user);
    return this.schoolService.assignLead(id, body.employeeId, { userId: req.user.userId, email: req.user.email });
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
    this.requireSalesAccess(req.user);
    return this.schoolService.updateLeadStatus(id, body.status, { userId: req.user.userId, email: req.user.email, role: req.user.role });
  }

  // ─── Campaigns & attribution (superadmin only — budget data) ──────────

  @UseGuards(AuthGuard('jwt'))
  @Get('campaigns')
  async getCampaigns(@Req() req: any) {
    this.requireSuperadmin(req.user);
    return this.schoolService.getAllCampaigns();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('campaigns')
  async createCampaign(@Req() req: any, @Body() body: any) {
    this.requireSuperadmin(req.user);
    return this.schoolService.createCampaign(body, { userId: req.user.userId, email: req.user.email });
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('campaigns/:id')
  async updateCampaign(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    this.requireSuperadmin(req.user);
    return this.schoolService.updateCampaign(id, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('campaigns/:id')
  async deleteCampaign(@Req() req: any, @Param('id') id: string) {
    this.requireSuperadmin(req.user);
    return this.schoolService.deleteCampaign(id);
  }

  // ─── Partners & commissions (Sales Ops Phase 4 — superadmin only) ─────

  @UseGuards(AuthGuard('jwt'))
  @Get('partners')
  async getPartners(@Req() req: any) {
    this.requireSuperadmin(req.user);
    return this.schoolService.getAllPartners();
  }

  // Static route — must stay registered before 'partners/:id' or Nest
  // would match "overview" as an :id instead.
  @UseGuards(AuthGuard('jwt'))
  @Get('partners/overview')
  async getPartnersOverview(@Req() req: any) {
    this.requireSuperadmin(req.user);
    return this.schoolService.getPartnersOverview();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('partners')
  async createPartner(@Req() req: any, @Body() body: any) {
    this.requireSuperadmin(req.user);
    return this.schoolService.createPartner(body, { userId: req.user.userId, email: req.user.email });
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('partners/:id')
  async updatePartner(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    this.requireSuperadmin(req.user);
    return this.schoolService.updatePartner(id, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('partners/:id')
  async deletePartner(@Req() req: any, @Param('id') id: string) {
    this.requireSuperadmin(req.user);
    return this.schoolService.deletePartner(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('partners/:id/commissions')
  async getPartnerCommissions(@Req() req: any, @Param('id') id: string) {
    this.requireSuperadmin(req.user);
    return this.schoolService.getPartnerCommissions(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('partners/commissions/:id/mark-paid')
  async markCommissionPaid(@Req() req: any, @Param('id') id: string, @Body() body: { note?: string }) {
    this.requireSuperadmin(req.user);
    return this.schoolService.markCommissionPaid(id, body, { email: req.user.email });
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
  @Get('apps-modules-by-institution')
  async getAppsModulesByInstitution(@Req() req: any) {
    this.requireSuperadmin(req.user);
    return this.schoolService.getAppsModulesByInstitution();
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
