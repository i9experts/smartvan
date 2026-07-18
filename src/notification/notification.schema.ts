/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;



@Schema({ timestamps: true })
export class Notification {

  @Prop()
  type?: string;


    @Prop()
  infoType?: string;

      @Prop()
  infoType2?: string;


    @Prop({ required: false })
  parentId?: string;

  @Prop({ required: false })
  driverId?: string;


    @Prop({ required: false })
  VanId?: string;

    @Prop({ required: false })
  schoolId?: string;

  @Prop({ type: Types.ObjectId, ref: 'Route', required: false })
  RouteId?: Types.ObjectId;

  @Prop({ required: false })
  title?: string;

    @Prop({ required: false })
  alertType?: string;

  @Prop({ required: false })
  message?: string;

  @Prop({ required: false })
  actionType?: string;

  
    @Prop({ required: false, default: "sent" })
  status?: string;


  @Prop({
    type: String,
    enum: ['ALL_PARENTS', 'ALL_DRIVERS', 'SPECIFIC_VAN', 'ADMIN'],
    required: false,
  })
  recipientType: 'ALL_PARENTS' | 'ALL_DRIVERS' | 'SPECIFIC_VAN' | 'ADMIN';

  // Voice message URL (S3) — used for driver-originated alerts, since many
  // drivers in our target markets aren't comfortable typing a message.
  @Prop({ required: false })
  audioUrl?: string;

  @Prop({ type: Date, default: Date.now })
  date?: Date;

}



export const NotificationSchema = SchemaFactory.createForClass(Notification);
