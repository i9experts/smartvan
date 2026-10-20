/* eslint-disable prettier/prettier */
// src/kid/schemas/kid.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type KidDocument = Kid & Document;

@Schema({ timestamps: true })
export class Kid {
 @Prop({ type: Types.ObjectId, ref: 'User', required: true })
parentId: Types.ObjectId;



@Prop({ required: false })
VanId: string;

@Prop({ required: false })
schoolId: string;

@Prop({ required: false })
fullname: string;

@Prop({ required: false })
gender: string;

@Prop({ required: false })
grade: string;

@Prop({ required: false, default: "" })
image: string;


@Prop({ required: false, default: "inActive" })
status: string;

@Prop({ required: false, default: "false" })
verifiedBySchool: boolean;

@Prop({ required: false })
age: number;

@Prop({ required: false })
dob: Date;

@Prop({ required: false, default: "" })
homeAddress: string;

@Prop({ required: false })
homeLat: number;

@Prop({ required: false })
homeLng: number;

// QR card token (see KidQrService). select:false so it is never returned by
// regular kid APIs — only the school's card-printing endpoints expose it.
@Prop({ required: false, unique: true, sparse: true, select: false })
qrToken?: string;

// ─── Parent Intelligence (super admin) ───────────────────────────────
// A parent can only pick a school that's already onboarded on SmartVan
// (addKid's school dropdown is strictly populated from getAllSchools) —
// so a family whose school hasn't joined yet had no way to be recorded
// anywhere at all, and sales had no visibility into that demand. When no
// real schoolId is given, addKid stores the parent's own free-text school
// name here instead, flagged as a prospect lead rather than an enrolled
// student.
@Prop({ required: false, default: false })
isProspect: boolean;

@Prop({ required: false })
prospectSchoolName?: string;

// Reverse-geocoded from homeLat/homeLng at addKid time — see
// reverseGeocodeAreas() — so the intelligence register can filter/group by
// area without re-geocoding on every read.
@Prop({ required: false })
city?: string;

@Prop({ required: false })
district?: string;

@Prop({ required: false })
town?: string;

@Prop({ required: false })
country?: string;

// Derived from grade at save time (Pre Nursery..G5 = primary, G6..G12 =
// secondary) — stored rather than computed on read so it's indexable and
// filterable directly in the register/overview aggregations.
@Prop({ required: false, enum: ['primary', 'secondary'] })
academicLevel?: string;
}







export const KidSchema = SchemaFactory.createForClass(Kid);
