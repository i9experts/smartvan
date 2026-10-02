/* eslint-disable prettier/prettier */
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class ScanStudentDto {
  @IsString()
  tripId: string;

  /** Raw text read from the card: "smartvan:kid:<token>" (bare token also accepted). */
  @IsString()
  qrPayload: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;
}
