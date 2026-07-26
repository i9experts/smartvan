/* eslint-disable prettier/prettier */
import { IsOptional, IsString, IsNumber } from 'class-validator';

export class CreateVanByAdminDto {
  

  // Vehicle Details
  @IsOptional()
  @IsString()
  vehicleType?: string; 

  @IsOptional()
  @IsString()
  vehicleCategory?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  model?: string;
  
  @IsOptional()
  @IsString()
  venImage?: string; 

  @IsOptional()
  @IsString()
  carNumber?: string; // Plate number

  @IsOptional()
  @IsString()
  condition?: string;          // Condition (e.g., Good)

  @IsOptional()
  @IsNumber()
  venCapacity?: number;           // Vehicle capacity

  @IsOptional()
  @IsString()
  deviceId?: string;           // Device ID

  @IsOptional()
  @IsString()
  assignRoute?: string;              // Route number
}
