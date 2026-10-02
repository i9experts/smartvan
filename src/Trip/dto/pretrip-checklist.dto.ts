/* eslint-disable prettier/prettier */
import { IsArray, IsOptional, IsString } from 'class-validator';

export class SubmitChecklistDto {
  @IsOptional()
  @IsString()
  routeId?: string;

  /** [{ key, ok, note? }] — every key from GET /trips/checklist/items. */
  @IsArray()
  items: { key: string; ok: boolean; note?: string }[];

  /** Optional photo, uploaded first via /upload/image. */
  @IsOptional()
  @IsString()
  photoUrl?: string;
}
