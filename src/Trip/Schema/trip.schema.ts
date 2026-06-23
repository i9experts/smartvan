/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TripDocument = Trip & Document;

@Schema({ timestamps: true })
export class Trip {
  @Prop({ type: String, required: true })
  vanId: string;

   @Prop({ type: String, required: true })
  routeId: string;

  @Prop({ type: String, required: true })
  schoolId: string;

  @Prop({ type: String, enum: ['pick', 'drop'], required: true })
  type: string;



  // Start point of trip
  @Prop({ type: Object, default: {} })
  tripStart?: {
    startTime?: Date;
    lat?: number;
    long?: number;
  };

  @Prop({ type: String, enum: ['start', 'ongoing', 'end'], default: 'start' })
  status: string;

  @Prop({
    type: [
      {
        kidId: { type: String, required: true },
        time: { type: Date },
        lat: Number,
        long: Number,
        status: { type: String, enum: ['picked', 'dropped'], required: true },
      },
    ],
    default: [],
  })
  kids: {
    kidId: string;
    time?: Date;
    lat?: number;
    long?: number;
    status: 'picked' | 'dropped';
  }[];

  // Array to store trip's route history
  @Prop({
    type: [
      {
        lat: { type: Number, required: true },
        long: { type: Number, required: true },
        time: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  locations: {
    lat: number;
    long: number;
    time?: Date;
  }[];

  // End point of trip
  @Prop({ type: Object })
  tripEnd?: {
    endTime?: Date;
    lat?: number;
    long?: number;
  };

  // Geofencing — tracks which zones the van is currently inside
  @Prop({ type: [String], default: [] })
  insideZoneIds: string[];
}

export const TripSchema = SchemaFactory.createForClass(Trip);
