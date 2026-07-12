/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ReportDocument = Report & Document;

@Schema({ timestamps: true })
export class Report {

   @Prop({ required: false })
  parentId?: string;

   @Prop({ required: false })
  schoolId?: string;

  @Prop({ required: false })
  kidId?: string;

  @Prop({ required: false })
  driverId?: string;

   @Prop({ default: "pending" })
  status?: string;

  @Prop({ required: false })
  issueType?: string;

  @Prop({ required: false })
  description?: string;
 
   @Prop({ required: false })
  type?: string;


  @Prop({ required: false })
  image?: string;

  @Prop({ required: false })
  audio?: string;

   @Prop({ required: false })
  video?: string;

     @Prop({ required: false })
  adminRemarks?: string;


  @Prop({ required: false })
  dateOfIncident?: Date;

  @Prop({ type: String, required: false })
  assignedTo?: string;
  @Prop({ type: Date, required: false })
  assignedAt?: Date;
  @Prop({ type: Date, required: false })
  resolvedAt?: Date;
}



export const ReportSchema = SchemaFactory.createForClass(Report);
