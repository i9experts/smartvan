/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type VanSchoolLinkDocument = VanSchoolLink & Document;

// Lets a van (and, through it, its assigned driver) be used by more than
// one school — the real-world case being one driver/van covering a
// combined route across two campuses of the same institution. The van's
// own schoolId field remains its "home" school (whoever originally
// registered it); this is the additional, approval-gated link granting
// a second school access to the same physical van/driver.
@Schema({ timestamps: true })
export class VanSchoolLink {
  @Prop({ required: true })
  vanId: string;

  @Prop({ required: true })
  homeSchoolId: string;

  @Prop({ required: true })
  requestingSchoolId: string;

  @Prop({ enum: ['pending', 'approved', 'rejected'], default: 'pending' })
  status: string;

  @Prop({ required: true })
  requestedByAdminId: string;

  @Prop({ required: false })
  respondedByAdminId?: string;

  @Prop({ required: false })
  respondedAt?: Date;
}

export const VanSchoolLinkSchema = SchemaFactory.createForClass(VanSchoolLink);
VanSchoolLinkSchema.index({ vanId: 1, requestingSchoolId: 1 }, { unique: true });
VanSchoolLinkSchema.index({ homeSchoolId: 1, status: 1 });
VanSchoolLinkSchema.index({ requestingSchoolId: 1, status: 1 });
