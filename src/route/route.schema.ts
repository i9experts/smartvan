/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RouteDocument = Route & Document;

@Schema({ timestamps: true })
export class Route {
  // Route kis school ke liye hai
  @Prop({ type: String, required: false })
  schoolId?: string;

 @Prop({ type: String, required: false })
 vanId?: string;


  // Route ka title (jaise "Morning Route A")
  @Prop({ required: false })
  title?: string;

  // Route start time
  @Prop({ required: false })
  startTime?: Date;

  // Trip type — morning, evening, afternoon, night
  @Prop({ required: false, enum: ["pick", "drop"] })
  tripType?: string;

  // Trip days — har din ke liye boolean
  @Prop({
    type: {
      monday: { type: Boolean, default: false },
      tuesday: { type: Boolean, default: false },
      wednesday: { type: Boolean, default: false },
      thursday: { type: Boolean, default: false },
      friday: { type: Boolean, default: false },
      saturday: { type: Boolean, default: false },
      sunday: { type: Boolean, default: false },
    },
    required: false,
  })
  tripDays?: {
    monday?: boolean;
    tuesday?: boolean;
    wednesday?: boolean;
    thursday?: boolean;
    friday?: boolean;
    saturday?: boolean;
    sunday?: boolean;
  };

  // Route starting point
  @Prop({
    type: {
      lat: { type: Number, required: true },
      long: { type: Number, required: true },
      address: { type: String, required: false },
    },
    required: false,
  })
  startPoint?: { lat: number; long: number; address?: string };

  // Route ending point
  @Prop({
    type: {
      lat: { type: Number, required: true },
      long: { type: Number, required: true },
      address: { type: String, required: false },
    },
    required: false,
  })
  endPoint?: { lat: number; long: number; address?: string };

  // Kids ke pickup/drop points (kidId + lat/long)
  @Prop({
    type: [
      {
        kidId: { type: Types.ObjectId, ref: 'Kid', required: true },
        lat: { type: Number, required: true },
        long: { type: Number, required: true },
      },
    ],
    required: false,
  })
  kidLocations?: { kidId: Types.ObjectId; lat: number; long: number }[];
}

export const RouteSchema = SchemaFactory.createForClass(Route);
