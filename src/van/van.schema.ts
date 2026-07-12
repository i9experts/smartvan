/* eslint-disable prettier/prettier */
// eslint-disable-next-line prettier/prettier
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VanDocument = Van & Document;

@Schema({ timestamps: true })
export class Van {
 @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  driverId?: Types.ObjectId;

  @Prop({ required: false })
  schoolId?: string;

  @Prop({ required: false })
  venImage?: string;

  @Prop({ required: false })
  condition?: string;

  @Prop({ required: false })
  vehicleType?: string;

  @Prop({ required: false })
  deviceId?: string;

  @Prop({ required: false })
  venCapacity?: number;

  @Prop({ required: false })
  assignRoute?: string;

  @Prop({ required: false })
  licenceImageFront?: string;

  @Prop({ required: false })
  licenceImageBack?: string;

  @Prop({ required: false })
  carNumber?: string;

  @Prop({ required: false })
  vehicleCardImageFront?: string;

  @Prop({ required: false })
  vehicleCardImageBack?: string;


  @Prop({ required: false })
  expiryDate?: string;


 @Prop({required: false, default: 'inActive' })
status: string;

@Prop({ type: Boolean, default: false })
ownVan: boolean;

// Fleet compliance dates — used for Fleet Health Score
@Prop({ type: Date, required: false })
insuranceExpiry?: Date;
@Prop({ type: Date, required: false })
registrationExpiry?: Date;
@Prop({ type: Date, required: false })
fitnessExpiry?: Date;
@Prop({ type: Date, required: false })
routePermitExpiry?: Date;

// Document Vault — file URLs (Cloudinary/S3), not OCR'd yet
@Prop({ required: false })
insuranceDocUrl?: string;
@Prop({ required: false })
registrationDocUrl?: string;
@Prop({ required: false })
fitnessDocUrl?: string;
@Prop({ required: false })
routePermitDocUrl?: string;

};





export const VanSchema = SchemaFactory.createForClass(Van);
