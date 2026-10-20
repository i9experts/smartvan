/* eslint-disable prettier/prettier */
// create-kid.dto.ts

import { IsOptional, IsString, IsBoolean, IsDate, IsNumber } from 'class-validator';


export class CreateKidDto {

  @IsOptional()
  @IsString()
  VanId?: string;

  @IsOptional()
  @IsString()
  schoolId?: string;

  // Free-text school name, set instead of schoolId when the parent's school
  // hasn't onboarded on SmartVan yet — see kid.service.addKid.
  @IsOptional()
  @IsString()
  prospectSchoolName?: string;

  @IsOptional()
  @IsString()
  fullname?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  grade?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsBoolean()
  verifiedBySchool?: boolean;

  @IsOptional()
  @IsNumber()
  age?: number;

  @IsOptional()
  @IsDate()
  dob?: Date;

  @IsOptional()
  @IsString()
  homeAddress?: string;

  @IsOptional()
  @IsNumber()
  homeLat?: number;

  @IsOptional()
  @IsNumber()
  homeLng?: number;
}
