/* eslint-disable prettier/prettier */
import { Controller, Get, Param, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TripHistoryService } from './trip-history.service';

/** Completed trips for the driver app. */
@Controller('driver/trips')
export class DriverTripHistoryController {
  constructor(private readonly history: TripHistoryService) {}

  private driverId(req: any): string {
    if (req.user?.userType !== 'driver') throw new UnauthorizedException('Only drivers can view this');
    return req.user.userId;
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('completed')
  completed(@Req() req: any, @Query('scope') scope?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.history.driverCompleted(this.driverId(req), { scope, page, limit });
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id/details')
  details(@Req() req: any, @Param('id') id: string) {
    return this.history.driverDetails(this.driverId(req), id);
  }
}

/** Completed trips for the parent app (own children only). */
@Controller('parent/trips')
export class ParentTripHistoryController {
  constructor(private readonly history: TripHistoryService) {}

  private parentId(req: any): string {
    if (req.user?.userType !== 'parent') throw new UnauthorizedException('Only parents can view this');
    return req.user.userId;
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('completed')
  completed(@Req() req: any, @Query('scope') scope?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.history.parentCompleted(this.parentId(req), { scope, page, limit });
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id/details')
  details(@Req() req: any, @Param('id') id: string) {
    return this.history.parentDetails(this.parentId(req), id);
  }
}

/** Live and historical trips for the school admin web (admin / school_staff; superadmin passes ?schoolId=). */
@Controller('admin/trips')
export class AdminTripHistoryController {
  constructor(private readonly history: TripHistoryService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('active')
  active(@Req() req: any, @Query('schoolId') schoolId?: string) {
    return this.history.adminActive(req.user, schoolId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('completed')
  completed(
    @Req() req: any,
    @Query('schoolId') schoolId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('driverId') driverId?: string,
    @Query('vanId') vanId?: string,
    @Query('routeId') routeId?: string,
    @Query('tripType') tripType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.history.adminCompleted(req.user, { schoolId, from, to, driverId, vanId, routeId, tripType, page, limit });
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id/details')
  details(@Req() req: any, @Param('id') id: string, @Query('schoolId') schoolId?: string) {
    return this.history.adminDetails(req.user, id, schoolId);
  }
}
