/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
import { IsOptional, IsString, IsNumber } from 'class-validator';


export class CreateVanDto {

  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsString()
  venImage?: string;

  @IsOptional()
  @IsString()
  condition?: string;

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
  deviceId?: string;

  @IsOptional()
  @IsNumber()
  venCapacity?: number;

  @IsOptional()
  @IsString()
  assignRoute?: string;

  @IsOptional()
  @IsString()
  licenceImageFront?: string;

  @IsOptional()
  @IsString()
  licenceImageBack?: string;

  @IsOptional()
  @IsString()
  carNumber?: string;

  @IsOptional()
  @IsString()
  vehicleCardImageFront?: string;

  @IsOptional()
  @IsString()
  vehicleCardImageBack?: string;

  @IsOptional()
  @IsString()
  status?: string; // default schema me "inactive" hai, lekin DTO me optional rakha
}
