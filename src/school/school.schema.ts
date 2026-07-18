/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SchoolDocument = School & Document;

@Schema({ _id: false })
class InvoiceEntry {
  @Prop({ required: true })
  invoiceId: string;

  @Prop({ required: true })
  date: Date; // store real Date in DB, format for UI on frontend

  @Prop({ required: true })
  amount: number;

  @Prop({
    required: true,
    enum: ['paid', 'unpaid', 'overdue'], // you can adjust
    default: 'paid',
  })
  status: string;

  @Prop()
  downloadUrl?: string; // S3 link / PDF link etc.
}


@Schema({ timestamps: true })
export class School {
  @Prop({ required: true })
  schoolName: string;

  @Prop()
  schoolImage: string;

  @Prop()
  schoolEmail: string;

  @Prop()
  contactPerson: string;

  @Prop()
  address: string;
  
  @Prop()
  branchName: string;
  
  @Prop()
  startTime: string;
  
  @Prop()
  endTime: string;

  @Prop()
  maxTripDuration: number;


  @Prop()
  bufferTime: number;

  
  @Prop()
  currentPlan: string;
  
   @Prop()
  billingCycle: string;
  
   @Prop()
  paymentMethod: string;
  

  
  @Prop()
  allowedVans: number;

  @Prop()
  allowedStudents: number;

   @Prop()
  allowedRoutes: number;

  @Prop()
  lat: number;

  @Prop()
  long: number;

  @Prop()
  autoRenew: boolean;

  @Prop()
  contactNumber: string;


  @Prop({ default: 'Asia/Karachi' })
  timezone: string;

  @Prop({ default: 'active' })
  status: string;

  // WhatsApp Business API
  @Prop()
  wabaId: string;
  @Prop()
  waPhoneNumberId: string;
  @Prop()
  waAccessToken: string;
  @Prop()
  waPhoneNumber: string;
  @Prop({ default: false })
  waConnected: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Admin' })
  admin: Types.ObjectId;
}

export const SchoolSchema = SchemaFactory.createForClass(School);
