/* eslint-disable prettier/prettier */

import { Controller, Post, Body, Req, Get, Query, NotFoundException, Param } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UseGuards } from '@nestjs/common';
import { RouteService } from './route.service'
import { CreateRouteDto } from './dto/createRoutedto';


@Controller('Route')
export class routeController {
  constructor(private readonly routetService: RouteService) {}


 @UseGuards(AuthGuard('jwt'))
  @Post("createRoute")
async createRoute(@Body() dto: CreateRouteDto, @Req() req) {
  const adminId = req.user.userId; // token se admin ka id
  return this.routetService.createRoute(dto, adminId);
}

@UseGuards(AuthGuard('jwt'))
@Get('getAssignedTripByDriver')
async getAssignedTripByDriver(@Req() req: any) {
  const driverId = req.user.userId; // token se driverId nikli
  return this.routetService.getAssignedTripByDriver(driverId);
}

@UseGuards(AuthGuard('jwt')) // JWT protection
@Get('getRoutes')
async getRoutes(
  @Req() req: any, // JWT se user info aayega
  @Query('page') page: string,
  @Query('limit') limit: string,
  @Query() query: any,
) {
  // JWT se adminId nikal lo
  const adminId = req.user.userId;

  if (!adminId) {
    throw new NotFoundException ('Admin not found in token');
  }

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
  const adminId = req.user.userId;
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
  const adminId = req.user.userId;

  return this.routetService.deleteRouteByAdmin(adminId, routeId);
}

  }