/* eslint-disable prettier/prettier */

import { Controller, Post, Body, Req, Get, Query, NotFoundException, Param, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UseGuards } from '@nestjs/common';
import { RouteService } from './route.service'
import { CreateRouteDto } from './dto/createRoutedto';
import { DatabaseService } from 'src/database/databaseservice';


@Controller('Route')
export class routeController {
  constructor(
    private readonly routetService: RouteService,
    private readonly databaseService: DatabaseService,
  ) {}

  private async resolveEffectiveAdminId(user: any): Promise<string> {
    if (user.role === 'admin') return user.userId;
    if (user.role === 'school_staff') {
      const school = await this.databaseService.repositories.SchoolModel.findById(user.schoolId);
      if (!school) throw new UnauthorizedException('School not found for this staff account');
      return school.admin.toString();
    }
    throw new UnauthorizedException('Invalid role for this action');
  }

  private requireRoutesPermission(user: any) {
    if (user.role === 'admin') return;
    if (user.role === 'school_staff' && (user.permissions || []).includes('manage_routes')) return;
    throw new UnauthorizedException('Insufficient permissions');
  }


 @UseGuards(AuthGuard('jwt'))
  @Post("createRoute")
async createRoute(@Body() dto: CreateRouteDto, @Req() req) {
  this.requireRoutesPermission(req.user);
  const adminId = await this.resolveEffectiveAdminId(req.user); // token se admin ka id
  return this.routetService.createRoute(dto, adminId);
}

@UseGuards(AuthGuard('jwt'))
@Get('getAssignedTripByDriver')
async getAssignedTripByDriver(@Req() req: any) {
  const driverId = req.user.userId; // token se driverId nikli
  return this.routetService.getAssignedTripByDriver(driverId);
}

@UseGuards(AuthGuard('jwt'))
@Get('getMergedActivePassengers')
async getMergedActivePassengers(@Req() req: any) {
  const driverId = req.user.userId;
  return this.routetService.getMergedActivePassengers(driverId);
}

@UseGuards(AuthGuard('jwt')) // JWT protection
@Get('getRoutes')
async getRoutes(
  @Req() req: any, // JWT se user info aayega
  @Query('page') page: string,
  @Query('limit') limit: string,
  @Query() query: any,
) {
  this.requireRoutesPermission(req.user);
  const adminId = await this.resolveEffectiveAdminId(req.user);

  // pagination values parse karo
  const pageNumber = page ? parseInt(page) : 1;
  const limitNumber = limit ? parseInt(limit) : 10;

  // service function call with pagination
  return this.routetService.getAllRoutesByAdmin(adminId, query);


}

@UseGuards(AuthGuard('jwt'))
@Get('getRouteById/:routeId')
async getRouteById(@Req() req: any, @Param('routeId') routeId: string) {
  const adminId = req.user.userId;
  return this.routetService.getRouteById(adminId, routeId);
}

@UseGuards(AuthGuard('jwt'))
@Post('editRoute')
async editRoute(
  @Req() req: any,
  @Body('routeId') routeId: string,  // routeId alag se body me aayega
  @Body() dto: CreateRouteDto        // baaki fields dto se aayengi
) {
  this.requireRoutesPermission(req.user);
  const adminId = await this.resolveEffectiveAdminId(req.user);
  return this.routetService.editRoute(adminId, routeId, dto);
}

@UseGuards(AuthGuard('jwt'))
@UseGuards(AuthGuard('jwt'))
@Post('assignStudentToRoute')
async assignStudentToRoute(@Req() req: any, @Body() body: { routeId: string; kidId: string; lat?: number; long?: number }) {
  return this.routetService.assignStudentToRoute(req.user.userId, body.routeId, body.kidId, body.lat || 0, body.long || 0);
}

@UseGuards(AuthGuard('jwt'))
@Post('removeStudentFromRoute')
async removeStudentFromRoute(@Req() req: any, @Body() body: { routeId: string; kidId: string }) {
  return this.routetService.removeStudentFromRoute(req.user.userId, body.routeId, body.kidId);
}

@UseGuards(AuthGuard('jwt'))
@Get('student-routes/:kidId')
async getStudentRoutes(@Req() req: any, @Param('kidId') kidId: string) {
  return this.routetService.getStudentRoutes(req.user.userId, kidId);
}

@UseGuards(AuthGuard('jwt'))
@Get('route-students/:routeId')
async getRouteStudents(@Req() req: any, @Param('routeId') routeId: string) {
  return this.routetService.getRouteStudents(req.user.userId, routeId);
}

@UseGuards(AuthGuard('jwt'))
@Post('deleteRouteByAdmin')
async deleteRouteByAdmin(
  @Req() req: any,
  @Body('routeId') routeId: string
) {
  this.requireRoutesPermission(req.user);
  const adminId = await this.resolveEffectiveAdminId(req.user);

  return this.routetService.deleteRouteByAdmin(adminId, routeId);
}

  }