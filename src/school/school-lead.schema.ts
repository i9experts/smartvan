/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SchoolLeadDocument = SchoolLead & Document;

@Schema({ timestamps: true })
export class SchoolLead {
  @Prop({ required: true })
  schoolName: string;

  @Prop({ required: true })
  schoolType: string;

  @Prop({ required: true })
  country: string;

  @Prop({ required: true })
  city: string;

  @Prop()
  address: string;

  @Prop()
  vanCount: string;

  @Prop()
  studentCount: string;

  @Prop({ required: true })
  adminName: string;

  @Prop({ required: true })
  designation: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  phone: string;

  @Prop()
  plan: string;

  @Prop()
  currency: string;

  @Prop()
  challenges: string;

  @Prop({ default: 'new' })
  status: string; // new | contacted | activated | rejected
}

export const SchoolLeadSchema = SchemaFactory.createForClass(SchoolLead);
