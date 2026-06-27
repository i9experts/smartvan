/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TransportFeeDocument = TransportFee & Document;

@Schema({ timestamps: true })
export class TransportFee {
  @Prop({ required: true })
  schoolId: string;

  @Prop({ required: false })
  routeId: string;

  @Prop({ required: false })
  vanId: string;

  @Prop({ required: true })
  amount: number; // e.g. 3000 (PKR)

  @Prop({ required: true, default: 'PKR' })
  currency: string; // PKR, SAR, AED, QAR

  @Prop({ required: true, default: 'monthly' })
  billingCycle: string; // monthly, quarterly, yearly

  @Prop({ required: false })
  description: string; // e.g. "Monthly transport fee - Route A"

  @Prop({ default: true })
  isActive: boolean;
}

export const TransportFeeSchema = SchemaFactory.createForClass(TransportFee);
