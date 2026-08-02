/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SchoolStaffDocument = SchoolStaff & Document;

// Permissions map to the school admin panel's own modules. Billing,
// Settings, and Contact Support are deliberately never delegable —
// billing/settings are financial/account-level, and Contact Support is
// the admin's own relationship with the SmartVan team.
export const SCHOOL_STAFF_PERMISSION_KEYS = [
  'view_dashboard',
  'manage_students',
  'manage_fleet',        // Vans + Drivers — e.g. a "Fleet Manager" role
  'manage_parents',
  'manage_routes',
  'view_alerts',
  'manage_complaints',
  'manage_fees',
  'view_fleet_health',
  'view_attendance',
  'view_analytics',
] as const;

@Schema({ timestamps: true })
export class SchoolStaff {
  @Prop({ required: true })
  fullname: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: false })
  phoneNo?: string;

  @Prop({ required: true })
  schoolId: string;

  @Prop({ required: false })
  roleTitle?: string; // display label, e.g. "Fleet Manager" — cosmetic only

  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop({ default: 'active', enum: ['active', 'inactive'] })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'Admin', required: true })
  createdBy: Types.ObjectId;
}

export const SchoolStaffSchema = SchemaFactory.createForClass(SchoolStaff);
SchoolStaffSchema.index({ schoolId: 1 });
