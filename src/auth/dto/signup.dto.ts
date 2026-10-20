/* eslint-disable prettier/prettier */

import { IsEmail, IsOptional, IsString, IsBoolean, IsEnum, IsNumber, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsString()
  fullname?: string;

  // Name of the school the parent's children attend, typed in by the parent
  // at self-registration (free text, not a link to a School document).
  @IsOptional()
  @IsString()
  @MaxLength(150)
  schoolName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsString()
  authProvider?: string;

  @IsOptional()
  @IsString()
  phoneNo?: string;

  @IsOptional()
  @IsString()
  NIC?: string;

 

  @IsOptional()
  @IsString()
  alternatePhoneNo?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  long?: number;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  otp?: string;

  @IsOptional()
  otpExpiresAt?: Date;

  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @IsOptional()
  @IsEnum(['parent', 'driver'])
  userType?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  fcmToken?: string;
}
