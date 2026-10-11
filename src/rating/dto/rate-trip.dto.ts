/* eslint-disable prettier/prettier */
import { IsIn, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class RateTripDto {
  @IsString()
  tripId: string;

  // Required when the rater is a driver (a trip can carry several parents,
  // so the driver must say which one). Ignored for a parent rater — the
  // server resolves the driver from the trip's van instead of trusting the
  // client, since a trip only has one driver.
  @IsOptional()
  @IsMongoId()
  rateeUserId?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  stars: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
