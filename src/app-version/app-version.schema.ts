/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AppVersionDocument = AppVersion & Document;

export const APP_NAMES = ['parent', 'driver'] as const;
export const APP_PLATFORMS = ['android', 'ios'] as const;
export type AppName = (typeof APP_NAMES)[number];
export type AppPlatform = (typeof APP_PLATFORMS)[number];

@Schema({ timestamps: { createdAt: false, updatedAt: 'updatedAt' }, collection: 'app_versions' })
export class AppVersion {
  @Prop({ required: true, enum: APP_NAMES })
  app: AppName;

  @Prop({ required: true, enum: APP_PLATFORMS })
  platform: AppPlatform;

  @Prop({ required: true }) // semantic version, e.g. "1.0.8"
  latestVersion: string;

  @Prop({ required: true, default: '0.0.0' }) // below this => force update
  minVersion: string;

  @Prop({ required: true })
  storeUrl: string;

  @Prop({ type: String, default: null })
  updateMessage: string | null;

  updatedAt?: Date;
}

export const AppVersionSchema = SchemaFactory.createForClass(AppVersion);
AppVersionSchema.index({ app: 1, platform: 1 }, { unique: true });
