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
}











export const UserSchema = SchemaFactory.createForClass(User);
