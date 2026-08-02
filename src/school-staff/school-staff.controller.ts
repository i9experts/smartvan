/* eslint-disable prettier/prettier */
import { Controller, Post, Get, Patch, Delete, Body, Param, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SchoolStaffService } from './school-staff.service';

@Controller('school-staff')
export class SchoolStaffController {
  constructor(private readonly schoolStaffService: SchoolStaffService) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    return this.schoolStaffService.loginStaff(body.email, body.password);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('permissions')
  async getAvailablePermissions(@Req() req: any) {
    if (req.user.role !== 'admin') {
      throw new UnauthorizedException('Only school admins can access this API');
    }
    return this.schoolStaffService.getAvailablePermissions();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('create')
  async createStaff(@Req() req: any, @Body() body: any) {
    if (req.user.role !== 'admin') {
      throw new UnauthorizedException('Only school admins can access this API');
    }
    return this.schoolStaffService.createStaff(req.user.userId, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('all')
  async getAllStaff(@Req() req: any) {
    if (req.user.role !== 'admin') {
      throw new UnauthorizedException('Only school admins can access this API');
    }
    return this.schoolStaffService.getAllStaff(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  async updateStaff(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    if (req.user.role !== 'admin') {
      throw new UnauthorizedException('Only school admins can access this API');
    }
    return this.schoolStaffService.updateStaff(req.user.userId, id, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  async deleteStaff(@Req() req: any, @Param('id') id: string) {
    if (req.user.role !== 'admin') {
      throw new UnauthorizedException('Only school admins can access this API');
    }
    return this.schoolStaffService.deleteStaff(req.user.userId, id);
  }
}
