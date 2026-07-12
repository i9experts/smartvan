/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EmployeeDocument = Employee & Document;

export const PERMISSION_KEYS = [
  'view_dashboard',
  'view_billing',
  'manage_billing',
  'view_fleet',
  'view_tickets',
  'manage_tickets',
  'view_schools',
  'manage_schools',
] as const;

@Schema({ timestamps: true })
export class Employee {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop({ default: 'active', enum: ['active', 'inactive'] })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'Admin', required: true })
  createdBy: Types.ObjectId;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);
