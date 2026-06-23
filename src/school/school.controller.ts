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

@Controller('school')
export class SchoolController {
  constructor(private readonly schoolService: SchoolService) {}

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

  @Get('getAllSchools')
  async getAllSchools() {
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
    return this.schoolService.changeSchoolStatusByAdmin(body.schoolId, body.status);
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
}
