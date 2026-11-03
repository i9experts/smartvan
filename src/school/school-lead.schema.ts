/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SchoolLeadDocument = SchoolLead & Document;

// Calls, WhatsApp chats, meetings, notes and status changes all land in the
// same list — a lead's history is one chronological feed, not several lists
// that have to be cross-referenced to see what actually happened and when.
@Schema({ _id: false })
class LeadActivityEntry {
  @Prop({ required: true, enum: ['note', 'call', 'whatsapp', 'meeting', 'email', 'status_change'] })
  type: string;

  @Prop({ required: true })
  summary: string;

  @Prop()
  authorEmail: string;

  @Prop({ required: true })
  occurredAt: Date;
}

@Schema()
class LeadTaskEntry {
  @Prop({ required: true })
  title: string;

  @Prop()
  dueAt?: Date;

  @Prop({ default: false })
  done: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  completedAt?: Date;
}

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

  // Pipeline stages (Sales Ops Phase 1). Legacy values 'activated'/'rejected'
  // are renamed to 'trial'/'lost' by a one-time startup migration — see
  // SchoolService.migrateLegacyLeadStatuses — so this field only ever holds
  // the six stages below from here on.
  @Prop({ default: 'new' })
  status: string; // new | contacted | demo | trial | won | lost

  // Set once a 'trial' transition provisions the real School account (or is
  // backfilled by email match for leads that already had one) — the link
  // billing.service.ts uses to auto-advance a lead to 'won' on first payment.
  @Prop({ type: Types.ObjectId, ref: 'School' })
  schoolId?: Types.ObjectId;

  @Prop({ type: [LeadActivityEntry], default: [] })
  activity: LeadActivityEntry[];

  @Prop({ type: [LeadTaskEntry], default: [] })
  tasks: LeadTaskEntry[];
}

export const SchoolLeadSchema = SchemaFactory.createForClass(SchoolLead);
