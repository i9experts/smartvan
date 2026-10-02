/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PaymentCheckoutDocument = PaymentCheckout & Document;

/** One attempt by a parent to pay a TransportPayment online. */
@Schema({ timestamps: true, collection: 'paymentcheckouts' })
export class PaymentCheckout {
  @Prop({ required: true, index: true })
  paymentId: string;

  @Prop({ required: true, index: true })
  parentId: string;

  @Prop({ required: true })
  kidId: string;

  @Prop({ required: true })
  schoolId: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, default: 'PKR' })
  currency: string;

  /** jazzcash | easypaisa | raast */
  @Prop({ required: true })
  method: string;

  /** Implementation that handled it: 'mock' today, real gateways later. */
  @Prop({ required: true })
  provider: string;

  @Prop({ required: true, enum: ['pending', 'succeeded', 'failed', 'expired'], default: 'pending' })
  status: string;

  /** Gateway's own transaction reference. */
  @Prop({ required: false, index: true })
  providerRef?: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ required: false })
  completedAt?: Date;

  @Prop({ required: false })
  failureReason?: string;
}

export const PaymentCheckoutSchema = SchemaFactory.createForClass(PaymentCheckout);
