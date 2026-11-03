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

  // Sales Ops Phase 5 — distinguishes a rep's own task from one the
  // stage-triggered follow-up sequence or the stale-lead escalation cron
  // created on their behalf, so the UI can label it and the escalation
  // cron can tell "already escalated" from "needs escalating" without
  // re-reading summary text.
  @Prop({ default: 'manual', enum: ['manual', 'auto'] })
  source: string;
}

@Schema({ timestamps: true })
export class SchoolLead {
  @Prop({ required: true })
  schoolName: string;

  // Only the website registration form fills these in — optional now that
  // leads also come from Contact Us, a manual quick-add, a spreadsheet
  // import, stalled trial schools, and converted parent demand, none of
  // which collect a school type/designation and some of which have no
  // phone at all (Contact Us is name+email+message only).
  @Prop()
  schoolType: string;

  @Prop()
  country: string;

  @Prop()
  city: string;

  @Prop()
  address: string;

  @Prop()
  vanCount: string;

  @Prop()
  studentCount: string;

  @Prop({ required: true })
  adminName: string;

  @Prop()
  designation: string;

  @Prop({ required: true })
  email: string;

  @Prop()
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

  // Where this lead came from (Sales Ops Phase 2's lead-capture sources) —
  // shown in the pipeline so the team can see which channel is working.
  @Prop({ default: 'website' })
  source: string; // website | contact_us | manual | import | stalled_trial | parent_demand

  // Set once a 'trial' transition provisions the real School account (or is
  // backfilled by email match for leads that already had one) — the link
  // billing.service.ts uses to auto-advance a lead to 'won' on first payment.
  @Prop({ type: Types.ObjectId, ref: 'School' })
  schoolId?: Types.ObjectId;

  @Prop({ type: [LeadActivityEntry], default: [] })
  activity: LeadActivityEntry[];

  @Prop({ type: [LeadTaskEntry], default: [] })
  tasks: LeadTaskEntry[];

  // Sales Ops Phase 3 — campaigns & team.
  @Prop()
  utmSource?: string;

  @Prop()
  utmMedium?: string;

  @Prop()
  utmCampaign?: string;

  // Resolved from utmCampaign at creation time if it matches a known
  // Campaign — stored directly so performance metrics don't need to
  // string-match utmCampaign against every campaign on every read.
  @Prop({ type: Types.ObjectId, ref: 'Campaign' })
  campaignId?: Types.ObjectId;

  // The sales rep working this lead — unset until a superadmin assigns it,
  // or auto-set to whichever employee manually added the lead themselves.
  @Prop({ type: Types.ObjectId, ref: 'Employee' })
  assignedTo?: Types.ObjectId;

  // Set the moment status first becomes 'won' (by updateLeadStatus or
  // billing's markLeadWonIfLinked) — the leaderboard's "won this month"
  // count reads this rather than updatedAt, which changes on any edit.
  @Prop()
  wonAt?: Date;

  // Sales Ops Phase 4 — referral/reseller partners. Captured the same way
  // as utmCampaign (first-touch, via Partner.referralCode) but kept as its
  // own field: a school can arrive through a marketing campaign and a
  // partner's referral link at once, and each pays out independently.
  @Prop()
  referralCode?: string;

  @Prop({ type: Types.ObjectId, ref: 'Partner' })
  partnerId?: Types.ObjectId;

  // Sales Ops Phase 5 — automation & sequences. A 0-100 score blending
  // pipeline stage, fleet size, attribution quality and engagement
  // recency, recomputed on every meaningful change and decayed nightly by
  // the stale-lead cron — see SchoolService.computeLeadScore. Lets the
  // team sort "which leads actually matter" instead of working strictly
  // oldest-first.
  @Prop({ default: 0 })
  score: number;

  @Prop()
  scoreUpdatedAt?: Date;

  // Set by the stale-lead escalation cron the first time a lead goes
  // quiet past its stage's threshold — cleared the next time real human
  // activity (not an auto-task) is logged, so it never masks a rep who's
  // actually back on it.
  @Prop()
  lastEscalatedAt?: Date;
}

export const SchoolLeadSchema = SchemaFactory.createForClass(SchoolLead);
