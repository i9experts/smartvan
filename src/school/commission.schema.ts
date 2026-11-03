/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CommissionDocument = Commission & Document;

// One row per real, confirmed payment from a partner-referred school —
// never accrued on a mere "Won" status change, since the actual invoice
// amount (vans can change, Premium can be added later) is only known once
// SmartVan has actually been paid. Created from the same two call sites
// billing.service.ts already uses to confirm a payment really happened
// (the Stripe webhook's invoice.payment_succeeded, and the superadmin's
// manual mark-paid override) — see SchoolService.accruePartnerCommission.
@Schema({ timestamps: true })
export class Commission {
  @Prop({ type: Types.ObjectId, ref: 'Partner', required: true })
  partnerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'School', required: true })
  schoolId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'SchoolLead', required: true })
  leadId: Types.ObjectId;

  @Prop({ required: true, enum: ['stripe_invoice', 'manual'] })
  source: string;

  // Stripe's own invoice id — the idempotency key that stops a webhook
  // retry (Stripe resends on timeout) from accruing the same payment twice.
  // Absent for a manual mark-paid, which only ever fires once per click.
  @Prop({ unique: true, sparse: true })
  stripeInvoiceId?: string;

  // What the school actually paid this invoice/charge — the base the
  // commission below was computed from.
  @Prop({ required: true })
  grossAmount: number;

  // Snapshot of the partner's commissionRate at accrual time, so a later
  // rate change never silently reshapes a commission already owed.
  @Prop({ required: true })
  rate: number;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  currency: string;

  @Prop({ default: 'pending', enum: ['pending', 'paid'] })
  status: string;

  @Prop()
  paidAt?: Date;

  @Prop()
  paidBy?: string;

  @Prop()
  note?: string;
}

export const CommissionSchema = SchemaFactory.createForClass(Commission);
