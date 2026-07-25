/* eslint-disable prettier/prettier */
import { IsOptional, IsString, IsNumber, IsDate, IsMongoId } from 'class-validator';
import { Type } from 'class-transformer';

export class EditStudentDto {
  @IsOptional()
  @IsString()
  kidImage?: string;

  @IsOptional()
  @IsMongoId()
  parentId?: string;

  @IsOptional()
  @IsString()
  VanId?: string;

  @IsOptional()
  @IsString()
  fullname?: string;

  @IsOptional()
  @IsString()
  gender?: string;

   @IsString()
    @IsOptional()
    image?: string;

  @IsOptional()
  @IsString()
  homeAddress?: string;

  @IsOptional()
  @IsNumber()
  homeLat?: number;

  @IsOptional()
  @IsNumber()
  homeLng?: number;

  @IsOptional()
  @IsString()
  grade?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  age?: number;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dob?: Date;
}
