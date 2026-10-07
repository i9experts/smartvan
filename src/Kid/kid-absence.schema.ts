/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type KidAbsenceDocument = KidAbsence & Document;

/**
 * Parent tells the van in advance that a child won't ride.
 * One document per kid per date; tripType says which trips are skipped.
 */
@Schema({ timestamps: true, collection: 'kidabsences' })
export class KidAbsence {
  @Prop({ required: true, index: true })
  kidId: string;

  @Prop({ required: true, index: true })
  parentId: string;

  @Prop({ required: false })
  vanId?: string;

  @Prop({ required: false })
  schoolId?: string;

  /** YYYY-MM-DD in the app timezone. */
  @Prop({ required: true, index: true })
  date: string;

  /** Which trips the child skips that day. */
  @Prop({ required: true, enum: ['pick', 'drop', 'both'], default: 'both' })
  tripType: string;

  @Prop({ required: false, maxlength: 300 })
  note?: string;
}

export const KidAbsenceSchema = SchemaFactory.createForClass(KidAbsence);
KidAbsenceSchema.index({ kidId: 1, date: 1 }, { unique: true });
