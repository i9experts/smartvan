/* eslint-disable prettier/prettier */
import { Body, Controller, Post, Param, Query, Req, Get, UnauthorizedException } from '@nestjs/common';
import { TripService } from './trip.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { PickStudentDto } from './dto/pick-student.dto';
import { EndTripDto } from './dto/tripend.dto';
import { AuthGuard } from '@nestjs/passport';
import { UseGuards } from '@nestjs/common';
import { getLocationDto } from './dto/getLocations';

@Controller('trips')
export class TripController {
  constructor(private readonly tripService: TripService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('startTrip')
  async startTrip(@Body() createTripDto: CreateTripDto, @Req() req: any) {
    return this.tripService.startTrip(req.user.userId, createTripDto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('pickStudent')
  async pickStudent(@Body() pickStudentDto: PickStudentDto, @Req() req: any) {
    return this.tripService.pickStudent(req.user.userId, pickStudentDto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('endTrip')
  async endTrip(@Body() dto: EndTripDto, @Req() req: any) {
    return await this.tripService.endTrip(req.user.userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('endTripForDrop')
  async endTripForDrop(@Body() dto: EndTripDto, @Req() req: any) {
    return await this.tripService.endTripForDrop(req.user.userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('pickStudentsFromSchool')
  async pickStudentsFromSchool(
    @Body() dto: { tripId: string; kidId: string },
    @Req() req: any,
  ) {
    return this.tripService.pickStudentsFromSchool(req.user.userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('dropStudentForHome')
  async dropStudentForHome(
    @Body() dto: { tripId: string; kidId: string; lat: number; long: number },
    @Req() req: any,
  ) {
    return this.tripService.dropStudentForHome(req.user.userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('getLocation')
  async getLocationsByDriver(@Body() dto: getLocationDto, @Req() req: any) {
    return await this.tripService.getLocationByDriver(dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('Get-Trips-By-Admin')
  async getTrips(
    @Req() req: any,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('status') status?: string,
    @Query('driverId') driverId?: string,
    @Query('schoolId') schoolId?: string,
    @Query('date') date?: string,
  ) {
    const adminId = req.user.userId;
    if (!adminId) throw new UnauthorizedException('Admin not found in token');
    return this.tripService.getTripsByAdmin(
      adminId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
      status,
      req?.user?.role,
      driverId,
      schoolId,
      date,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('getDashboard')
  async getDashboard(@Req() req: any, @Query('filterType') filterType: any) {
    const adminId = req.user.userId;
    if (!adminId) throw new UnauthorizedException('Admin not found in token');
    return this.tripService.generateGraphData(adminId, req?.user?.role, filterType);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('getDriverTrips')
  async getDriverTrips(@Req() req: any) {
    return this.tripService.getTripsByDriver(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('eta/:tripId')
  async getETA(
    @Param('tripId') tripId: string,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Req() req: any,
  ) {
    return this.tripService.getETA(tripId, parseFloat(lat), parseFloat(lng));
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('updateLocation/:tripId')
  async updateLocation(
    @Param('tripId') tripId: string,
    @Body() body: { lat: number; lng: number },
    @Req() req: any,
  ) {
    return this.tripService.updateLocationAndBroadcastETA(
      req.user.userId,
      tripId,
      body.lat,
      body.lng,
    );
  }
  // ─── Digital Attendance ─────────────────────────────────────────────────

  @UseGuards(AuthGuard('jwt'))
  @Get('attendance/daily')
  async getDailyAttendance(
    @Req() req: any,
    @Query('date') date?: string,
    @Query('vanId') vanId?: string,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.tripService.getDailyAttendance(
      req.user.userId,
      req.user.role,
      date,
      vanId,
      schoolId,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('attendance/student/:kidId')
  async getStudentAttendance(
    @Param('kidId') kidId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.tripService.getStudentAttendanceHistory(kidId, startDate, endDate);
  }


}