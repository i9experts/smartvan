/* eslint-disable prettier/prettier */
import { IsNotEmpty, IsString, IsNumber, IsDate, IsOptional, IsMongoId } from 'class-validator';
import { Type } from 'class-transformer';

export class AddStudentDto {

  @IsOptional()
  kidImage?: string; // optional field
 
  
  @IsOptional()
  @IsString()
  schoolId?: string;


  @IsOptional()
 @IsMongoId()
  parentId?: string;

    @IsOptional()
    @IsString()
     VanId?: string;


  @IsString()
  @IsOptional()
  fullname?: string;

  @IsString()
  @IsOptional()
  gender?: string;

   @IsString()
  @IsOptional()
  grade?: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsString()
  @IsOptional()
  homeAddress?: string;

  @IsNumber()
  @IsOptional()
  homeLat?: number;

  @IsNumber()
  @IsOptional()
  homeLng?: number;

   @IsString()
  @IsOptional()
  status?: string;



  @IsNumber()
  @IsOptional()
  age?: number;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  dob?: Date;
}


