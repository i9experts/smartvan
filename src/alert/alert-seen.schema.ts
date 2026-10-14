/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AlertSeenDocument = AlertSeen & Document;

/** When a school admin / staff member last opened the Alerts page. */
@Schema({ timestamps: true, collection: 'alertseens' })
export class AlertSeen {
  @Prop({ required: true, unique: true, index: true })
  userId: string;

  @Prop({ required: true })
  schoolId: string;

  @Prop({ required: true })
  seenAt: Date;
}

export const AlertSeenSchema = SchemaFactory.createForClass(AlertSeen);
