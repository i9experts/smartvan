/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TransportPaymentDocument = TransportPayment & Document;

@Schema({ timestamps: true })
export class TransportPayment {
  @Prop({ required: true })
  schoolId: string;

  @Prop({ required: true })
  kidId: string;

  @Prop({ required: true })
  parentId: string;

  @Prop({ required: false })
  feeId: string;

  @Prop({ required: false })
  vanId: string;

  @Prop({ required: false })
  routeId: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, default: 'PKR' })
  currency: string;

  @Prop({
    required: true,
    enum: ['cash', 'jazzcash', 'easypaisa', 'bank_transfer', 'card', 'other'],
    default: 'cash',
  })
  paymentMethod: string;

  @Prop({
    required: true,
    enum: ['paid', 'pending', 'overdue'],
    default: 'pending',
  })
  status: string;

  @Prop({ required: true })
  month: string; // e.g. "2026-06" — billing month

  @Prop({ required: false })
  paidAt: Date;

  @Prop({ required: false })
  collectedBy: string; // driverId or adminId who marked it paid

  @Prop({ required: false })
  collectedByType: string; // 'driver' | 'admin'

  @Prop({ required: false })
  notes: string;

  @Prop({ required: false })
  receiptNumber: string;
}

export const TransportPaymentSchema = SchemaFactory.createForClass(TransportPayment);
