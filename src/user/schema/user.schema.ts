/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {

  @Prop()
  schoolId: string;
 @Prop()
  fullname: string;

  @Prop({ required: false, unique: true, sparse: true })
  email: string;

  @Prop({ required: false})
  providerId: string;
  
  @Prop({ required: false  })
  authProvider: string;

  @Prop()
  phoneNo: string;

  @Prop({ required: false  })
  NIC: string;

  @Prop({ required: false, default: null })
  lastLoginAt: Date;

  @Prop()
  alternatePhoneNo: string;

  @Prop()
  address: string;

  @Prop({ required: false })
  licenceImageFront?: string;

  @Prop({ required: false })
  licenceImageBack?: string;



  @Prop({ required: false })
  vehicleCardImageFront?: string;

    @Prop({ required: false })
  vehicleCardImageBack?: string;


  @Prop({ required: false })
  expiryDateLicense?: string;

    @Prop({ required: false })
  expiryDateVehicleCard?: string;

  @Prop()
  lat: number;

  @Prop()
  long: number;

  @Prop()
  password: string;

  @Prop()
  otp: string;
  
   @Prop()
   otpExpiresAt: Date;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop({ enum: ['parent', 'driver'] })
  userType: string;

  @Prop({ default: null })
  image: string;

    @Prop({ default: true })
  notificationToggle: boolean;


  @Prop({required: false, default: null })
  fcmToken: string;

    @Prop({required: false })
  deleteReason: string;

    @Prop({default: false })
    isDelete: boolean ;

    @Prop({ default: "inActive" })
  status: string;

  // Two-way trip rating — parents rate their driver, drivers rate parents,
  // after every completed trip. Sum/count (not a running average) so the
  // average can be recomputed exactly and cheaply on read.
  @Prop({ default: 0 })
  ratingSum: number;

  @Prop({ default: 0 })
  ratingCount: number;

  // Driver-side: incremented once per completed trip (endTrip/endTripForDrop),
  // independent of whether either side actually rated. Shown alongside the
  // driver's rating on the driver app home screen.
  @Prop({ default: 0 })
  completedTripCount: number;
}











export const UserSchema = SchemaFactory.createForClass(User);
