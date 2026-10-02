/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PretripChecklistDocument = PretripChecklist & Document;

/**
 * Vehicle check for one van on one (app-timezone) day. Submitting again the
 * same day updates it. One check covers all of that van's trips that day.
 */
@Schema({ timestamps: true, collection: 'pretripchecklists' })
export class PretripChecklist {
  @Prop({ type: String, required: true, index: true })
  driverId: string;

  @Prop({ type: String, required: true })
  vanId: string;

  @Prop({ type: String, required: true })
  schoolId: string;

  /** Route the driver was about to start when submitting (informational). */
  @Prop({ type: String, required: false })
  routeId?: string;

  /** YYYY-MM-DD in the app timezone. */
  @Prop({ type: String, required: true })
  date: string;

  @Prop({
    type: [{ key: { type: String, required: true }, ok: { type: Boolean, required: true }, note: String }],
    default: [],
  })
  items: { key: string; ok: boolean; note?: string }[];

  @Prop({ type: String, required: false })
  photoUrl?: string;

  /** True when every item is ok. */
  @Prop({ type: Boolean, default: true })
  allOk: boolean;
}

export const PretripChecklistSchema = SchemaFactory.createForClass(PretripChecklist);
PretripChecklistSchema.index({ vanId: 1, date: 1 }, { unique: true });
