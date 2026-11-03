/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CampaignDocument = Campaign & Document;

@Schema({ timestamps: true })
export class Campaign {
  @Prop({ required: true })
  name: string;

  @Prop()
  channel: string; // facebook | google | whatsapp | referral | organic | other — free text, kept flexible

  // Together these form the tracking link (smartvan.pk/?utm_source=...&utm_medium=...&utm_campaign=...)
  // and utmCampaign is the key a lead's own utmCampaign is matched against to attribute it here.
  @Prop()
  utmSource: string;

  @Prop()
  utmMedium: string;

  @Prop({ required: true, unique: true })
  utmCampaign: string;

  @Prop({ default: 0 })
  spend: number;

  @Prop({ default: 'PKR' })
  currency: string;

  @Prop()
  startDate?: Date;

  @Prop()
  endDate?: Date;

  @Prop({ default: 'active', enum: ['active', 'paused', 'ended'] })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'Admin' })
  createdBy?: Types.ObjectId;
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);
