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
  'manage_leads',
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

  // Sales Ops Phase 3 — only meaningful for employees with the
  // manage_leads permission; the leaderboard shows progress against it.
  @Prop({ default: 0 })
  monthlyTarget: number;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);
