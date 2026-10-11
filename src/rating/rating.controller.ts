/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RatingService } from './rating.service';
import { RateTripDto } from './dto/rate-trip.dto';

@Controller('rating')
export class RatingController {
  constructor(private readonly ratingService: RatingService) {}

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
}
