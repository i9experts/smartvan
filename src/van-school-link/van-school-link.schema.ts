/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type VanSchoolLinkDocument = VanSchoolLink & Document;

// Lets a van AND/OR its driver be used by more than one school — the
// real-world case being one driver/van covering a combined route across
// two campuses of the same institution. The van's own schoolId (or the
// driver's own schoolId, if no van is assigned yet) remains its "home"
// school; this is the additional, approval-gated link granting a second
// school access to the same physical van/driver. A driver may not have
// a van assigned at the moment a second school requests access — vanId
// is optional for exactly that reason, and getLinkedVanIds resolves a
// driver-only link to whatever van that driver is CURRENTLY assigned
// to, if any, so access follows the driver even if their van changes.
@Schema({ timestamps: true })
export class VanSchoolLink {
  @Prop({ required: false })
  vanId?: string;

  @Prop({ required: false })
  driverId?: string;

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
VanSchoolLinkSchema.index({ driverId: 1, requestingSchoolId: 1 }, { unique: true, partialFilterExpression: { driverId: { $exists: true } } });
VanSchoolLinkSchema.index({ homeSchoolId: 1, status: 1 });
VanSchoolLinkSchema.index({ requestingSchoolId: 1, status: 1 });
