/* eslint-disable prettier/prettier */
import { Body, Controller, Post, Param, Query, Req, Get, UnauthorizedException } from '@nestjs/common';
import { TripService } from './trip.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { PickStudentDto } from './dto/pick-student.dto';
import { EndTripDto } from './dto/tripend.dto';
import { OptimizeRouteDto } from './dto/optimize-route.dto';
import { AuthGuard } from '@nestjs/passport';
import { UseGuards } from '@nestjs/common';
import { getLocationDto } from './dto/getLocations';
import { ScanStudentDto } from './dto/scan-student.dto';
import { SubmitChecklistDto } from './dto/pretrip-checklist.dto';
import { TripLiveService } from './trip-live.service';
import { DatabaseService } from 'src/database/databaseservice';

@Controller('trips')
export class TripController {
  constructor(
    private readonly tripService: TripService,
    private readonly databaseService: DatabaseService,
    private readonly tripLive: TripLiveService,
  ) {}

  // ─── Live map data (driver of the van, parent of a kid on it, school admin/staff) ──

  /** Stops in visiting order with status + road polyline through the remaining stops. */
  @UseGuards(AuthGuard('jwt'))
  @Get(':tripId/route-plan')
  async routePlan(@Param('tripId') tripId: string, @Req() req: any) {
    return this.tripLive.routePlan(req.user, tripId);
  }

  /** Path the van has driven so far on this trip (encoded polyline). */
  @UseGuards(AuthGuard('jwt'))
  @Get(':tripId/trail')
  async trail(@Param('tripId') tripId: string, @Req() req: any) {
    return this.tripLive.trail(req.user, tripId);
  }

  private requireAttendancePermission(user: any) {
    if (user.role === 'admin' || user.role === 'superadmin') return;
    if (user.role === 'school_staff' && (user.permissions || []).includes('view_attendance')) return;
    throw new UnauthorizedException('Insufficient permissions');
  }

  // Same pattern as VanController — school_staff don't have their own
  // admin account, resolve their school's actual admin so service methods
  // that expect an adminId work unchanged for them too.
  private async resolveEffectiveAdminId(user: any): Promise<string> {
    if (user.role === 'admin') return user.userId;
    if (user.role === 'school_staff') {
      const school = await this.databaseService.repositories.SchoolModel.findById(user.schoolId);
      if (!school) throw new UnauthorizedException('School not found for this staff account');
      return school.admin.toString();
    }
    throw new UnauthorizedException('Invalid role for this action');
  }

  private requireFleetPermission(user: any) {
    if (user.role === 'admin') return;
    if (user.role === 'school_staff' && (user.permissions || []).includes('manage_fleet')) return;
    throw new UnauthorizedException('Insufficient permissions');
  }

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

  // ─── Pre-trip vehicle checklist (driver) ─────────────────────────────

  @UseGuards(AuthGuard('jwt'))
  @Get('checklist/items')
  async getChecklistItems() {
    return this.tripService.getChecklistItems();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('checklist/today')
  async getTodayChecklist(@Req() req: any) {
    return this.tripService.getTodayChecklist(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('checklist')
  async submitChecklist(@Body() dto: SubmitChecklistDto, @Req() req: any) {
    return this.tripService.submitChecklist(req.user.userId, dto);
  }

  // ─── Pre-trip checklist (admin) ───────────────────────────────────────

  @UseGuards(AuthGuard('jwt'))
  @Get('checklist/forAdmin')
  async getChecklistLogForAdmin(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('vanId') vanId?: string,
    @Query('driverId') driverId?: string,
    @Query('status') status?: 'ok' | 'issues',
  ) {
    this.requireFleetPermission(req.user);
    const adminId = await this.resolveEffectiveAdminId(req.user);
    return this.tripService.getChecklistLogForAdmin(
      adminId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
      startDate,
      endDate,
      vanId,
      driverId,
      status,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('checklist/complianceSummary')
  async getChecklistComplianceSummary(@Req() req: any) {
    this.requireFleetPermission(req.user);
    const adminId = await this.resolveEffectiveAdminId(req.user);
    return this.tripService.getChecklistComplianceSummary(adminId);
  }

  /** Body { tripId, kidId } — tells the parent the van is at the stop. */
  @UseGuards(AuthGuard('jwt'))
  @Post('arrivedAtStop')
  async arrivedAtStop(@Body() body: { tripId: string; kidId: string }, @Req() req: any) {
    return this.tripService.arrivedAtStop(req.user.userId, body);
  }

  /** Body { tripId, kidId, note? } — pick trips: kid wasn't at the stop. */
  @UseGuards(AuthGuard('jwt'))
  @Post('noShow')
  async noShow(@Body() body: { tripId: string; kidId: string; note?: string }, @Req() req: any) {
    return this.tripService.markNoShow(req.user.userId, body);
  }

  /** Driver scans a student's QR card → pick or drop. */
  @UseGuards(AuthGuard('jwt'))
  @Post('scanStudent')
  async scanStudent(@Body() dto: ScanStudentDto, @Req() req: any) {
    return this.tripService.scanStudent(req.user.userId, dto);
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

  // Driver-requested route optimization (advisory — doesn't affect the
  // trip itself). See TripService.optimizeRoute for how "saved" is computed.
  @UseGuards(AuthGuard('jwt'))
  @Post('optimizeRoute')
  async optimizeRoute(@Body() dto: OptimizeRouteDto, @Req() req: any) {
    return await this.tripService.optimizeRoute(req.user.userId, dto);
  }

  // Admin-facing log of individual optimize-route events (see getAnalytics
  // for the aggregate view this complements).
  @UseGuards(AuthGuard('jwt'))
  @Get('routeOptimization/forAdmin')
  async getRouteOptimizationLogForAdmin(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('driverId') driverId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    this.requireFleetPermission(req.user);
    const adminId = await this.resolveEffectiveAdminId(req.user);
    return this.tripService.getRouteOptimizationLogForAdmin(
      adminId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
      driverId,
      startDate,
      endDate,
    );
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
    @Body() body: { lat: number; lng: number; speed?: number },
    @Req() req: any,
  ) {
    return this.tripService.updateLocationAndBroadcastETA(
      req.user.userId,
      tripId,
      Number(body.lat),
      Number(body.lng),
      body.speed,
    );
  }

  /** Driver's own stats for the last ?days= (default 7, max 90). */
  @UseGuards(AuthGuard('jwt'))
  @Get('driver-stats')
  async getDriverStats(@Req() req: any, @Query('days') days?: string) {
    return this.tripService.getDriverStats(req.user.userId, Number(days) || 7);
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
    this.requireAttendancePermission(req.user);

    if (req.user.role === 'school_staff') {
      // The service's own resolution only recognizes adminRole === 'admin'
      // to look up a school via an admin account. A staff member already
      // carries their schoolId directly, so pass it straight through and
      // present as 'admin' so the service uses the schoolId we resolved
      // here (via the school lookup below) instead of trying to find an
      // admin account for the staff member's own id (which doesn't exist).
      const school = await this.databaseService.repositories.SchoolModel.findById(req.user.schoolId);
      if (!school) throw new UnauthorizedException('School not found for this staff account');
      return this.tripService.getDailyAttendance(
        school.admin.toString(),
        'admin',
        date,
        vanId,
        schoolId,
      );
    }

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