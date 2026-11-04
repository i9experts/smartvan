/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RevenueSnapshotDocument = RevenueSnapshot & Document;

// One row per calendar day (Asia/Karachi), upserted every time the Revenue
// Analytics overview is requested. There's no point-in-time subscription
// ledger anywhere in the system today — MRR is always computed live from
// current school/van state — so this is how the trend chart accumulates
// real history going forward instead of needing a separate backfill or cron.
@Schema({ timestamps: true })
export class RevenueSnapshot {
  @Prop({ required: true, unique: true })
  date: string; // YYYY-MM-DD, Asia/Karachi

  @Prop({ type: Object, required: true })
  mrrByCurrency: Record<string, number>;

  @Prop({ type: Object, required: true })
  vanBillingMrrByCurrency: Record<string, number>;

  @Prop({ type: Object, required: true })
  premiumMrrByCurrency: Record<string, number>;

  @Prop({ type: Object, required: true })
  atRiskMrrByCurrency: Record<string, number>;

  @Prop({ required: true })
  totalSchools: number;

  @Prop({ required: true })
  premiumActiveCount: number;
}

export const RevenueSnapshotSchema = SchemaFactory.createForClass(RevenueSnapshot);
