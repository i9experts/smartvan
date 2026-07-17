/* eslint-disable prettier/prettier */
import { IsOptional, IsString, IsNumber, IsDateString } from 'class-validator';

export class EditVanByAdminDto {
  @IsString()
  vanId: string;
  
  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @IsString()
  carNumber?: string;

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional()
  @IsString()
  venImage?: string;

  @IsOptional()
  @IsNumber()
  venCapacity?: number;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  assignRoute?: string;

  @IsOptional()
  @IsDateString()
  insuranceExpiry?: string;
  @IsOptional()
  @IsDateString()
  registrationExpiry?: string;
  @IsOptional()
  @IsDateString()
  fitnessExpiry?: string;
  @IsOptional()
  @IsDateString()
  routePermitExpiry?: string;

  @IsOptional()
  @IsString()
  insuranceDocUrl?: string;
  @IsOptional()
  @IsString()
  registrationDocUrl?: string;
  @IsOptional()
  @IsString()
  fitnessDocUrl?: string;
  @IsOptional()
  @IsString()
  routePermitDocUrl?: string;
}
