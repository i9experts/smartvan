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

  // Driver SOS → WhatsApp to parents (see SosWhatsappService).
  @Prop({ required: false, index: true })
  tripId?: string;

  /** tripId, or "van:<id>" when the SOS had no trip — one batch per key per 5 min. */
  @Prop({ required: false, index: true })
  whatsappBatchKey?: string;

  @Prop({ type: Date, required: false })
  whatsappBatchAt?: Date;

  /** Why no batch was sent: "throttled" | "no_recipients". */
  @Prop({ required: false })
  whatsappSkipped?: string;

  @Prop({
    type: [{
      parentId: String,
      phone: String,
      status: { type: String, enum: ['sent', 'failed'] },
      messageId: String,
      error: String,
      sentAt: Date,
      _id: false,
    }],
    default: undefined,
  })
  whatsappNotifications?: {
    parentId: string;
    phone: string;
    status: 'sent' | 'failed';
    messageId?: string;
    error?: string;
    sentAt: Date;
  }[];

}



export const NotificationSchema = SchemaFactory.createForClass(Notification);
