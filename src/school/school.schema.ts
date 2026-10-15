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

@Schema({ _id: false })
class ManualPaymentEntry {
  @Prop({ required: true })
  type: string; // 'van_billing' | 'premium_feature_tier'

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  currency: string;

  @Prop({ required: true })
  note: string;

  @Prop({ required: true })
  markedBy: string; // superadmin email

  @Prop({ required: true })
  markedAt: Date;
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

  // ─── Feature tier (Basic vs Premium) ─────────────────────────────────
  // Orthogonal to currentPlan/subscriptionStatus above, which track the
  // existing per-van Stripe billing. This controls which product MODULES
  // the school can use at all, independent of how many vans they pay for.
  @Prop({ type: String, enum: ['basic', 'premium'], default: 'basic' })
  featureTier: string;

  // Per-school hand-tuning on top of the tier's defaults — e.g. comping a
  // Basic school early access to one Premium feature, or (rarely) pulling
  // a feature a Premium school shouldn't have. See feature-keys.ts for the
  // canonical registry and effectiveFeatures() for how these combine.
  @Prop({ type: [String], default: [] })
  enabledFeatures: string[];

  @Prop({ type: [String], default: [] })
  disabledFeatures: string[];

  // Separate Stripe subscription from the per-van billing one above — see
  // billing.service.ts's webhook handler for why these must never be
  // conflated with subscriptionStatus/currentPlan.
  @Prop()
  premiumStripeSubscriptionId: string;

  @Prop({ type: String, enum: ['active', 'inactive', 'payment_failed'], default: 'inactive' })
  premiumSubscriptionStatus: string;

  // A payment collected outside Stripe's own checkout (manually-sent
  // invoice/payment link, bank transfer) never produces a Stripe invoice —
  // nothing for getBillingHistory's live Stripe query to ever show. Each
  // manuallyMarkPaid() call appends one entry here so Payment History has
  // something to display for it, clearly tagged as manually recorded.
  @Prop({ type: [ManualPaymentEntry], default: [] })
  manualPayments: ManualPaymentEntry[];
}

export const SchoolSchema = SchemaFactory.createForClass(School);
