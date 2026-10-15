/* eslint-disable prettier/prettier */
import {
  Controller,
  Body,
  Get,
  Post,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RatingService } from './rating.service';
import { RateTripDto } from './dto/rate-trip.dto';
import { DatabaseService } from 'src/database/databaseservice';
import { FeatureGuard } from 'src/auth/guard/feature.guard';
import { RequireFeature } from 'src/auth/decorator/require-feature.decorator';

@Controller('rating')
export class RatingController {
  constructor(
    private readonly ratingService: RatingService,
    private readonly databaseService: DatabaseService,
  ) {}

  // school_staff callers don't have an admin account of their own —
  // resolve their school's actual admin, same pattern used throughout
  // AdminController/VanController/ReportController.
  private async resolveEffectiveAdminId(user: any): Promise<string> {
    if (user.role === 'admin') return user.userId;
    if (user.role === 'school_staff') {
      const school = await this.databaseService.repositories.SchoolModel.findById(user.schoolId);
      if (!school) throw new UnauthorizedException('School not found for this staff account');
      return school.admin.toString();
    }
    throw new ForbiddenException('Only a school admin can view ratings');
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('rateTrip')
  async rateTrip(@Body() dto: RateTripDto, @Req() req: any) {
    return this.ratingService.rateTrip(req.user.userId, req.user.userType, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('myRatingSummary')
  async myRatingSummary(@Req() req: any) {
    return this.ratingService.getMyRatingSummary(req.user.userId, req.user.userType);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('pendingRatings')
  async pendingRatings(@Req() req: any) {
    return this.ratingService.getPendingRatings(req.user.userId, req.user.userType);
  }

  // Admin-only: a driver's or parent's individual review history, for the
  // dashboard's detail-view "Reviews" section.
  @UseGuards(AuthGuard('jwt'))
  @Get('getRatingsForUser/:userId')
  async getRatingsForUser(@Param('userId') userId: string, @Req() req: any) {
    const adminId = await this.resolveEffectiveAdminId(req.user);
    return this.ratingService.getRatingsForUserAsAdmin(adminId, userId);
  }

  // Admin-only: a browsable, filterable log of every rating in the school
  // (vs. getRatingsForUser's per-person view).
  @UseGuards(AuthGuard('jwt'), FeatureGuard)
  @RequireFeature('ratings')
  @Get('getAllRatingsForSchool')
  async getAllRatingsForSchool(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('rateeRole') rateeRole?: 'driver' | 'parent',
    @Query('minStars') minStars?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const adminId = await this.resolveEffectiveAdminId(req.user);
    return this.ratingService.getAllRatingsForSchool(
      adminId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
      rateeRole,
      minStars ? parseInt(minStars) : undefined,
      startDate,
      endDate,
    );
  }
}
