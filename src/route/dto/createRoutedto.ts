/* eslint-disable prettier/prettier */
import { IsOptional, IsString, IsBoolean, IsObject, IsDateString } from 'class-validator';

export class CreateRouteDto {

  @IsOptional()
  @IsString()
  schoolId?: string;

   @IsOptional()
  @IsString()
  vanId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsString()
  tripType?: string;

  @IsOptional()
  @IsObject()
  tripDays?: {
    monday?: boolean;
    tuesday?: boolean;
    wednesday?: boolean;
    thursday?: boolean;
    friday?: boolean;
    saturday?: boolean;
    sunday?: boolean;
  };

  @IsOptional()
  @IsObject()
  startPoint?: {
    lat?: number;
    long?: number;
    address?: string;
  };

  @IsOptional()
  @IsObject()
  endPoint?: {
    lat?: number;
    long?: number;
    address?: string;
  };

  @IsOptional()
  kidLocations?: { kidId: string; lat: number; long: number }[];
}
