/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PartnerDocument = Partner & Document;

// Sales Ops Phase 4 — referral/reseller partners. A partner is an external
// person or organisation (individual agent, SME channel partner, reseller)
// who brings in school signups in exchange for a commission on what those
// schools pay — distinct from an Employee (internal sales rep, no payout).
@Schema({ timestamps: true })
export class Partner {
  @Prop({ required: true })
  name: string;

  @Prop()
  contactName?: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  phone?: string;

  @Prop({ default: 'individual_agent', enum: ['individual_agent', 'channel_partner', 'reseller'] })
  type: string;

  // The tracking-link key (smartvan.pk/?ref=CODE) a lead's own referralCode
  // is matched against to attribute it here — immutable once set, same as
  // Campaign.utmCampaign, so an edit can never orphan already-attributed leads.
  @Prop({ required: true, unique: true })
  referralCode: string;

  // Percent of what a referred school pays SmartVan (van billing + Premium
  // invoices alike) that this partner earns — e.g. 10 means 10%.
  @Prop({ required: true, default: 10 })
  commissionRate: number;

  @Prop({ default: 'active', enum: ['active', 'inactive'] })
  status: string;

  // Free text — bank account, JazzCash/Easypaisa number, whatever this
  // partner was actually paid out to. Not validated/structured; this module
  // tracks who's owed what, it doesn't move money.
  @Prop()
  paymentDetails?: string;

  @Prop()
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'Admin' })
  createdBy?: Types.ObjectId;
}

export const PartnerSchema = SchemaFactory.createForClass(Partner);
