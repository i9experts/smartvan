/* eslint-disable prettier/prettier */
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class OptimizeRouteDto {
  @IsString()
  tripId: string;

  // Driver's current position, if available — used as the optimization
  // origin instead of wherever the trip happened to start, since some time
  // may have passed since then. Falls back to trip.tripStart when omitted.
  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  long?: number;
}
