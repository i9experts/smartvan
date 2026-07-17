/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

export const AUDIT_ACTIONS = [
  'login',
  'school_suspended',
  'school_activated',
  'employee_created',
  'employee_deleted',
  'employee_permissions_changed',
  'ticket_assigned',
] as const;

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ required: true })
  action: string;

  @Prop({ required: true })
  actorId: string;

  @Prop({ required: true })
  actorEmail: string;

  @Prop({ required: true })
  actorRole: string;

  @Prop({ type: Object, required: false })
  metadata?: Record<string, any>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
