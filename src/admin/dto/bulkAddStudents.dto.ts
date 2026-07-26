/* eslint-disable prettier/prettier */
import { IsString, IsNumber, IsOptional, IsEmail, IsArray, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkStudentRowDto {
  @IsString()
  fullname: string;

  @IsString()
  grade: string;

  @IsString()
  gender: string;

  @IsNumber()
  @IsOptional()
  age?: number;

  @IsString()
  @IsOptional()
  dob?: string;

  @IsEmail()
  parentEmail: string;

  @IsString()
  @IsOptional()
  parentPhone?: string;
}

export class BulkAddStudentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkStudentRowDto)
  students: BulkStudentRowDto[];
}
