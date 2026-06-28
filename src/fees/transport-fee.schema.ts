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
  description: string;

  @Prop({ required: false, default: 'both' })
  serviceType: string; // 'pick_only' | 'drop_only' | 'both'

  @Prop({ required: false })
  pickOnlyAmount: number;

  @Prop({ required: false })
  dropOnlyAmount: number;

  @Prop({ required: false })
  siblingDiscountPercent: number;

  @Prop({ required: false })
  earlyPaymentDiscountPercent: number;

  @Prop({ required: false })
  earlyPaymentDeadlineDay: number; // day of month e.g. 5

  @Prop({ required: false })
  lateFeeAmount: number;

  @Prop({ required: false })
  lateFeeAfterDay: number; // day of month after which late fee applies

  @Prop({ required: false })
  notes: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const TransportFeeSchema = SchemaFactory.createForClass(TransportFee);
