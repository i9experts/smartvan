/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RatingDocument = Rating & Document;

@Schema({ timestamps: true })
export class Rating {
  @Prop({ type: String, required: true })
  tripId: string;

  @Prop({ type: String, required: true })
  vanId: string;

  @Prop({ type: String, required: true })
  schoolId: string;

  @Prop({ type: Types.ObjectId, required: true })
  raterUserId: Types.ObjectId;

  @Prop({ type: String, enum: ['parent', 'driver'], required: true })
  raterRole: string;

  @Prop({ type: Types.ObjectId, required: true })
  rateeUserId: Types.ObjectId;

  @Prop({ type: String, enum: ['parent', 'driver'], required: true })
  rateeRole: string;

  @Prop({ type: Number, required: true, min: 1, max: 5 })
  stars: number;

  @Prop({ type: String, required: false, default: '' })
  comment?: string;
}

export const RatingSchema = SchemaFactory.createForClass(Rating);

// One rating per (trip, rater, ratee) pair — a parent with several kids on
// the same trip rates the driver once, not once per kid, and vice versa.
RatingSchema.index({ tripId: 1, raterUserId: 1, rateeUserId: 1 }, { unique: true });
