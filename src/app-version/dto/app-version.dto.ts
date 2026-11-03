/* eslint-disable prettier/prettier */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUrl, Matches, MaxLength, ValidateIf } from 'class-validator';
import { APP_NAMES, APP_PLATFORMS } from '../app-version.schema';
import { SEMVER_REGEX } from '../semver.util';

export class GetAppVersionQueryDto {
  @ApiProperty({ enum: APP_NAMES, example: 'parent' })
  @IsIn(APP_NAMES as unknown as string[])
  app: (typeof APP_NAMES)[number];

  @ApiProperty({ enum: APP_PLATFORMS, example: 'ios' })
  @IsIn(APP_PLATFORMS as unknown as string[])
  platform: (typeof APP_PLATFORMS)[number];
}

export class UpdateAppVersionDto {
  @ApiPropertyOptional({ example: '1.0.9' })
  @IsOptional()
  @Matches(SEMVER_REGEX, { message: 'latestVersion must match ^\\d+\\.\\d+\\.\\d+$' })
  latestVersion?: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @Matches(SEMVER_REGEX, { message: 'minVersion must match ^\\d+\\.\\d+\\.\\d+$' })
  minVersion?: string;

  @ApiPropertyOptional({ example: 'https://apps.apple.com/app/id6817291757' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  storeUrl?: string;

  @ApiPropertyOptional({ nullable: true, example: 'A new version is available.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  updateMessage?: string | null;
}
