/* eslint-disable prettier/prettier */
import { Controller, Post, Get, Patch, Delete, Body, Param, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EmployeeService } from './employee.service';

@Controller('employee')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    return this.employeeService.loginEmployee(body.email, body.password);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('permissions')
  async getAvailablePermissions(@Req() req: any) {
    if (req.user.role !== 'superadmin') {
      throw new UnauthorizedException('Only superadmins can access this API');
    }
    return this.employeeService.getAvailablePermissions();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('create')
  async createEmployee(@Req() req: any, @Body() body: any) {
    if (req.user.role !== 'superadmin') {
      throw new UnauthorizedException('Only superadmins can access this API');
    }
    return this.employeeService.createEmployee(req.user.userId, body, req.user);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('all')
  async getAllEmployees(@Req() req: any) {
    if (req.user.role !== 'superadmin') {
      throw new UnauthorizedException('Only superadmins can access this API');
    }
    return this.employeeService.getAllEmployees();
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  async updateEmployee(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    if (req.user.role !== 'superadmin') {
      throw new UnauthorizedException('Only superadmins can access this API');
    }
    return this.employeeService.updateEmployee(id, body, req.user);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  async deleteEmployee(@Req() req: any, @Param('id') id: string) {
    if (req.user.role !== 'superadmin') {
      throw new UnauthorizedException('Only superadmins can access this API');
    }
    return this.employeeService.deleteEmployee(id, req.user);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('assign-ticket')
  async assignTicket(@Req() req: any, @Body() body: { reportId: string; employeeId: string }) {
    if (req.user.role !== 'superadmin' && !(req.user.permissions || []).includes('manage_tickets')) {
      throw new UnauthorizedException('Insufficient permissions');
    }
    return this.employeeService.assignTicket(body.reportId, body.employeeId, req.user);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('my-tickets')
  async getMyTickets(@Req() req: any) {
    if (req.user.role !== 'employee') {
      throw new UnauthorizedException('Only employees can access this API');
    }
    return this.employeeService.getMyTickets(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('my-tickets/:id/status')
  async updateMyTicketStatus(@Req() req: any, @Param('id') id: string, @Body() body: { status: string; adminRemarks?: string }) {
    if (req.user.role !== 'employee') {
      throw new UnauthorizedException('Only employees can access this API');
    }
    return this.employeeService.updateMyTicketStatus(req.user.userId, id, body.status, body.adminRemarks);
  }
}
