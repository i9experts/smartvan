/* eslint-disable prettier/prettier */
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class EndTripDto {
 @IsOptional()
  @IsString()
  tripId: string;

  @IsOptional()
  @IsNumber()
  lat: number;

  @IsOptional()
  @IsNumber()
  long: number;

  @IsOptional()
  @IsString()
  time?: string;   // 👈 string rakha hai

  /**
   * Drop trips only: end the trip even though some kids are still marked
   * as picked (not dropped). Requires confirmationNote. The school admin is
   * alerted and those kids' parents are NOT told their child was dropped.
   */
  @IsOptional()
  @IsBoolean()
  forceEnd?: boolean;

  @IsOptional()
  @IsString()
  confirmationNote?: string;
}
