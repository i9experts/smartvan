/* eslint-disable prettier/prettier */
import { Injectable, UnauthorizedException, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PickStudentDto } from './dto/pick-student.dto';
import mongoose from 'mongoose';
import * as moment from "moment-timezone"

import { Types } from "mongoose";

const TZ = process.env.DEFAULT_TIMEZONE || "Asia/Karachi";



import { CreateTripDto } from './dto/create-trip.dto';
import { DatabaseService } from "src/database/databaseservice";
import { EtaService } from './eta.service';
import { GeofenceService, GeofenceZone } from './geofence.service';
import { EndTripDto } from './dto/tripend.dto';
import { getLocationDto } from './dto/getLocations';
import { FirebaseAdminService } from 'src/notification/firebase-admin.service';
import { Kid } from 'src/Kid/kid.schema';
import { EventsGateway } from 'src/events/events.gateway';
import { findUndroppedKidIds, requiresDropConfirmation } from './trip-safety.util';
import { decideScanAction } from './scan-action.util';
import {
  etaPushToSend,
  MAX_SEGMENT_METERS,
  overspeedLimitKmh,
  speedKmh,
  waitingKidIds,
} from './location-pipeline.util';

type CachedEta = { kidId: string; minutes: number; etaTime: string; distanceMeters: number };
/** tripId → last Distance Matrix result (single-instance cache). */
/** Start/end of the current day in Asia/Karachi, as UTC Dates. */
function pktDayBounds(now: Date = new Date()): { start: Date; end: Date } {
  const start = moment(now).tz(TZ).startOf('day');
  return { start: start.toDate(), end: start.clone().add(1, 'day').toDate() };
}

const etaCache = new Map<string, { at: number; eta: CachedEta[] }>();
const ETA_REFRESH_MS = 60_000;
import { ScanStudentDto } from './dto/scan-student.dto';
import { parseQrPayload } from 'src/Kid/kid-qr.util';
import { absenceCovers, todayIn } from 'src/Kid/kid-absence.util';
import { SubmitChecklistDto } from './dto/pretrip-checklist.dto';
import {
  checklistDate,
  checklistItemDefs,
  isChecklistRequired,
  validateChecklistItems,
} from './pretrip-checklist.util';
@Injectable()
export class TripService {
  constructor(
   private databaseService: DatabaseService,
   private firebaseAdminService: FirebaseAdminService,
   private readonly etaService: EtaService,
   private readonly geofenceService: GeofenceService,
   private readonly eventsGateway: EventsGateway,
  ) {} 

// ─── Absences, waiting at stop, no-shows ────────────────────────────────

/** Route kids with a parent-marked absence covering a trip of [tripType] today. */
private async absentKidIdsToday(kidIds: string[], tripType: string): Promise<Set<string>> {
  if (!kidIds.length) return new Set();
  const docs: any[] = await this.databaseService.repositories.kidAbsenceModel
    .find({ kidId: { $in: kidIds }, date: todayIn(TZ) }, { kidId: 1, tripType: 1 })
    .lean();
  return new Set(docs.filter(d => absenceCovers(d.tripType, tripType)).map(d => d.kidId));
}

/** Common checks: ongoing trip on the caller's van, kid on its route. */
private async loadTripForStopAction(driverId: string, tripId: string, kidId: string) {
  const fail = (code: string, message: string) => new BadRequestException({ success: false, code, message });
  if (!Types.ObjectId.isValid(tripId)) throw fail('TRIP_NOT_FOUND', 'Trip not found');
  if (!Types.ObjectId.isValid(kidId)) throw fail('KID_NOT_ON_TRIP', 'Student not found');
  const repos = this.databaseService.repositories;
  const trip = await repos.TripModel.findById(tripId);
  if (!trip) throw fail('TRIP_NOT_FOUND', 'Trip not found');
  if (trip.status !== 'ongoing') throw fail('TRIP_NOT_ONGOING', 'This trip is not in progress.');
  const van: any = await repos.VanModel.findOne({ driverId: new Types.ObjectId(driverId) }).lean();
  if (!van || trip.vanId !== van._id.toString()) throw fail('TRIP_NOT_YOURS', 'This trip does not belong to your van.');
  const route: any = await repos.routeModel.findById(trip.routeId, { kidLocations: 1 }).lean();
  const onRoute = (route?.kidLocations || []).some((kl: any) => kl?.kidId?.toString() === kidId);
  if (!onRoute) throw fail('KID_NOT_ON_TRIP', 'This student is not on this route.');
  const kid: any = await repos.KidModel.findById(kidId, { fullname: 1, parentId: 1 }).lean();
  const parent: any = kid?.parentId
    ? await repos.parentModel.findOne({ _id: kid.parentId, isDelete: false }, { fcmToken: 1 }).lean()
    : null;
  return { trip, van, kid, parent };
}

private async pushParent(parent: any, kid: any, van: any, title: string, body: string, data: Record<string, string>) {
  try {
    if (parent?.fcmToken) {
      await this.firebaseAdminService.sendToDevice(parent.fcmToken, { notification: { title, body }, data });
    }
    if (kid?.parentId) {
      await this.databaseService.repositories.notificationModel.create({
        type: 'driver', infoType: 'Trip', parentId: kid.parentId.toString(),
        schoolId: van.schoolId, VanId: van._id.toString(), title, message: body,
        actionType: data.type, status: 'sent', date: new Date(),
      });
    }
  } catch (e) {
    console.error('[stop action] parent notify failed:', e);
  }
}

/**
 * Driver is at the kid's stop. Tells the parent once per kid per trip
 * ("send your child out" on pick trips, "arrived home" on drop trips).
 */
async arrivedAtStop(driverId: string, body: { tripId: string; kidId: string }) {
  const { trip, van, kid, parent } = await this.loadTripForStopAction(driverId, body?.tripId, body?.kidId);
  const existing = (trip.stopWaits || []).find(w => w.kidId === body.kidId);
  if (existing) {
    return { success: true, message: 'Parent already informed', data: { kidId: body.kidId, waitingSince: existing.at } };
  }
  const at = new Date();
  await this.databaseService.repositories.TripModel.updateOne(
    { _id: trip._id }, { $push: { stopWaits: { kidId: body.kidId, at } } },
  );
  const name = kid?.fullname || 'your child';
  const pick = trip.type !== 'drop';
  await this.pushParent(parent, kid, van,
    pick ? 'Van is at your stop' : 'Van has arrived home',
    pick ? `The van is waiting for ${name}. Please send them out now.` : `The van is at your home with ${name}.`,
    { type: 'VAN_AT_STOP', tripId: trip._id.toString(), kidId: body.kidId },
  );
  return { success: true, message: 'Parent informed', data: { kidId: body.kidId, waitingSince: at } };
}

/** Pick trips: kid wasn't at the stop and the driver is moving on. */
async markNoShow(driverId: string, body: { tripId: string; kidId: string; note?: string }) {
  const { trip, van, kid, parent } = await this.loadTripForStopAction(driverId, body?.tripId, body?.kidId);
  const fail = (code: string, message: string) => new BadRequestException({ success: false, code, message });
  if (trip.type === 'drop') throw fail('NOT_PICK_TRIP', 'No-show can only be marked on pick trips.');
  if ((trip.kids || []).some(k => k.kidId === body.kidId)) {
    throw fail('ALREADY_PICKED', `${kid?.fullname || 'This student'} is already on the van.`);
  }
  if ((trip.noShows || []).some(n => n.kidId === body.kidId)) {
    return { success: true, message: 'Already marked' };
  }
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 200) : undefined;
  await this.databaseService.repositories.TripModel.updateOne(
    { _id: trip._id },
    { $push: { noShows: { kidId: body.kidId, at: new Date(), ...(note ? { note } : {}) } } },
  );
  const name = kid?.fullname || 'Your child';
  await this.pushParent(parent, kid, van,
    'Van has left your stop',
    `${name} wasn't at the stop, so the van moved on. Please contact the driver or school.`,
    { type: 'NO_SHOW', tripId: trip._id.toString(), kidId: body.kidId },
  );
  return { success: true, message: 'Marked as not at stop' };
}

// ─── Pre-trip vehicle checklist ─────────────────────────────────────────

private async driverAndVan(driverId: string) {
  const driverObjectId = new Types.ObjectId(driverId);
  const driver: any = await this.databaseService.repositories.driverModel.findById(driverObjectId).lean();
  if (!driver) throw new UnauthorizedException('Driver not found');
  const van: any = await this.databaseService.repositories.VanModel.findOne({ driverId: driverObjectId }).lean();
  if (!van) throw new BadRequestException('Van not assigned to this driver');
  return { driver, van };
}

getChecklistItems() {
  return {
    success: true,
    data: checklistItemDefs(),
    required: isChecklistRequired(),
  };
}

async getTodayChecklist(driverId: string) {
  const { van } = await this.driverAndVan(driverId);
  const doc = await this.databaseService.repositories.pretripChecklistModel
    .findOne({ vanId: van._id.toString(), date: checklistDate(TZ) })
    .lean();
  return { success: true, data: doc || null, required: isChecklistRequired() };
}

async submitChecklist(driverId: string, dto: SubmitChecklistDto) {
  const { driver, van } = await this.driverAndVan(driverId);

  const error = validateChecklistItems(dto?.items, checklistItemDefs());
  if (error) {
    throw new BadRequestException({ success: false, code: 'INVALID_CHECKLIST', message: error });
  }

  const items = dto.items.map((i) => ({
    key: i.key,
    ok: i.ok,
    ...(i.note && i.note.trim() ? { note: i.note.trim().slice(0, 500) } : {}),
  }));
  const failed = items.filter((i) => !i.ok);
  const date = checklistDate(TZ);

  const doc = await this.databaseService.repositories.pretripChecklistModel.findOneAndUpdate(
    { vanId: van._id.toString(), date },
    {
      $set: {
        driverId: driver._id.toString(),
        schoolId: van.schoolId,
        routeId: dto.routeId,
        items,
        photoUrl: dto.photoUrl,
        allOk: failed.length === 0,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  if (failed.length) {
    const labels = new Map(checklistItemDefs().map((d) => [d.key, d.label]));
    const issues = failed.map((f) => (labels.get(f.key) || f.key) + (f.note ? ` (${f.note})` : ''));
    const driverName = driver.fullname || 'Driver';
    const message = `${driverName} reported van issues in the pre-trip check` +
      `${van.carNumber ? ` (van ${van.carNumber})` : ''}: ${issues.join('; ')}`;
    try {
      const alert = await this.databaseService.repositories.notificationModel.create({
        type: 'pretrip_issue',
        alertType: 'PRETRIP_CHECK_FAILED',
        recipientType: 'ADMIN',
        infoType: 'Warning',
        driverId: driver._id.toString(),
        schoolId: van.schoolId,
        VanId: van._id.toString(),
        title: 'Van check issues',
        message,
        status: 'sent',
        date: new Date(),
      });
      this.eventsGateway.emitToSchool(van.schoolId, 'pretripChecklistAlert', {
        alertId: alert._id.toString(),
        checklistId: (doc as any)?._id?.toString(),
        driverId: driver._id.toString(),
        driverName,
        vanId: van._id.toString(),
        failedItems: failed,
        photoUrl: dto.photoUrl,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[checklist] admin alert failed:', e);
    }
  }

  return {
    success: true,
    message: failed.length
      ? 'Checklist saved. The school has been told about the issues.'
      : 'Checklist saved',
    data: doc,
  };
}

// ─── QR scan pickup / drop ──────────────────────────────────────────────

/**
 * Driver scans a student's QR card. Decides pick vs drop from the kid's
 * state on this trip, then delegates to the existing pick/drop methods
 * (which do all the driver/van/trip ownership checks and notifications).
 */
async scanStudent(driverId: string, dto: ScanStudentDto) {
  const fail = (code: string, message: string) =>
    new BadRequestException({ success: false, code, message });

  const token = parseQrPayload(dto?.qrPayload);
  if (!token) throw fail('INVALID_QR', 'This is not a SmartVan student card.');

  if (!dto.tripId || !Types.ObjectId.isValid(dto.tripId)) {
    throw fail('TRIP_NOT_FOUND', 'Trip not found');
  }
  const repos = this.databaseService.repositories;
  const trip: any = await repos.TripModel.findById(dto.tripId).lean();
  if (!trip) throw fail('TRIP_NOT_FOUND', 'Trip not found');
  if (trip.status !== 'ongoing') throw fail('TRIP_NOT_ONGOING', 'This trip is not in progress.');

  const van: any = await repos.VanModel.findOne({ driverId: new Types.ObjectId(driverId) }).lean();
  if (!van || trip.vanId !== van._id.toString()) {
    throw fail('TRIP_NOT_YOURS', 'This trip does not belong to your van.');
  }

  const kid: any = await repos.KidModel.findOne({ qrToken: token }, { fullname: 1, VanId: 1, status: 1 }).lean();
  if (!kid) throw fail('INVALID_QR', 'Card not recognised. It may have been replaced — ask the school for a new one.');
  const kidId = kid._id.toString();

  // Kid must belong to this van / route.
  let onTrip = kid.VanId === trip.vanId;
  if (!onTrip && trip.routeId) {
    const route: any = await repos.routeModel.findById(trip.routeId, { kidLocations: 1 }).lean();
    onTrip = (route?.kidLocations || []).some((kl: any) => kl?.kidId?.toString() === kidId);
  }
  if (!onTrip) throw fail('KID_NOT_ON_TRIP', `${kid.fullname || 'This student'} is not a passenger on this van.`);

  const action = decideScanAction(trip.type, kidId, trip.kids);
  const base = { kidId, fullname: kid.fullname, tripId: dto.tripId };

  switch (action) {
    case 'alreadyPicked':
      throw fail('ALREADY_PICKED', `${kid.fullname || 'This student'} is already picked up. Students are dropped at school when you end the trip.`);
    case 'alreadyDropped':
      throw fail('ALREADY_DROPPED', `${kid.fullname || 'This student'} has already been dropped on this trip.`);
    case 'pick':
      await this.pickStudent(driverId, { tripId: dto.tripId, kidId, lat: dto.lat, long: dto.lng });
      return { success: true, message: `${kid.fullname} picked up`, data: { action: 'picked', ...base } };
    case 'pickFromSchool':
      await this.pickStudentsFromSchool(driverId, { tripId: dto.tripId, kidId });
      return { success: true, message: `${kid.fullname} picked from school`, data: { action: 'picked', ...base } };
    case 'drop':
      if (typeof dto.lat !== 'number' || typeof dto.lng !== 'number') {
        throw fail('LOCATION_REQUIRED', 'Your GPS location is required to record a drop.');
      }
      await this.dropStudentForHome(driverId, { tripId: dto.tripId, kidId, lat: dto.lat, long: dto.lng });
      return { success: true, message: `${kid.fullname} dropped`, data: { action: 'dropped', ...base } };
  }
}

// ─── Child-left-behind safety check ─────────────────────────────────────

/**
 * For drop trips: refuses to end the trip while any kid is still marked as
 * picked (i.e. possibly still in the van), unless the driver explicitly
 * forces it with a note. Returns the undropped kids when forced.
 */
private async checkKidsDroppedBeforeEnd(
  trip: any,
  dto: EndTripDto,
): Promise<{ kidId: string; fullname: string }[]> {
  if (!requiresDropConfirmation(trip.type)) return [];

  const undroppedIds = findUndroppedKidIds(trip.kids);
  if (!undroppedIds.length) return [];

  const docs = await this.databaseService.repositories.KidModel.find(
    { _id: { $in: undroppedIds.map((id) => new Types.ObjectId(id)) } },
    { fullname: 1 },
  ).lean();
  const nameById = new Map(docs.map((d: any) => [d._id.toString(), d.fullname]));
  const kids = undroppedIds.map((id) => ({ kidId: id, fullname: nameById.get(id) || 'Student' }));

  if (!dto.forceEnd) {
    throw new ConflictException({
      success: false,
      code: 'KIDS_NOT_DROPPED',
      message:
        `${kids.length} student${kids.length === 1 ? ' is' : 's are'} still marked as in the van: ` +
        `${kids.map((k) => k.fullname).join(', ')}. Drop them first, or check the van and confirm.`,
      kids,
    });
  }

  if (!dto.confirmationNote || !dto.confirmationNote.trim()) {
    throw new BadRequestException({
      success: false,
      code: 'CONFIRMATION_NOTE_REQUIRED',
      message: 'A confirmation note is required to end the trip with students not dropped.',
    });
  }
  return kids;
}

/** Alerts the school and the affected parents after a forced trip end. */
private async notifyForcedEnd(
  trip: any,
  van: any,
  driver: any,
  kids: { kidId: string; fullname: string }[],
  note: string,
) {
  const names = kids.map((k) => k.fullname).join(', ');
  const driverName = driver?.fullname || 'Driver';
  const message =
    `${driverName} ended a drop trip with ${kids.length} student(s) not marked as dropped: ` +
    `${names}. Driver note: "${note}"`;

  try {
    const alert = await this.databaseService.repositories.notificationModel.create({
      type: 'child_left_behind',
      alertType: 'KIDS_NOT_DROPPED',
      recipientType: 'ADMIN',
      infoType: 'Emergency',
      driverId: driver?._id?.toString(),
      schoolId: van.schoolId,
      VanId: van._id.toString(),
      title: 'Students not dropped',
      message,
      status: 'sent',
      date: new Date(),
    });

    this.eventsGateway.emitToSchool(van.schoolId, 'childLeftBehindAlert', {
      alertId: alert._id.toString(),
      tripId: trip._id.toString(),
      driverId: driver?._id?.toString(),
      driverName,
      vanId: van._id.toString(),
      kids,
      note,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[endTrip] admin alert for undropped kids failed:', e);
  }

  // Parents of these kids must not believe their child was dropped.
  for (const k of kids) {
    try {
      const kid = await this.databaseService.repositories.KidModel.findById(k.kidId);
      if (!kid?.parentId) continue;
      const parent = await this.databaseService.repositories.parentModel.findOne({
        _id: kid.parentId,
        isDelete: false,
      });
      const title = 'Drop not confirmed';
      const body = `The van trip has ended but ${kid.fullname}'s drop-off was not confirmed by the driver. Please contact the school.`;
      if (parent?.fcmToken) {
        // Sent even if the parent muted notifications — this is a safety alert.
        await this.firebaseAdminService.sendToDevice(parent.fcmToken, {
          notification: { title, body },
          data: { type: 'drop_not_confirmed', kidId: k.kidId, tripId: trip._id.toString() },
        });
      }
      await this.databaseService.repositories.notificationModel.create({
        type: 'driver',
        infoType: 'Emergency',
        parentId: kid.parentId.toString(),
        schoolId: van.schoolId,
        VanId: van._id.toString(),
        title,
        message: body,
        actionType: 'DROP_NOT_CONFIRMED',
        status: 'sent',
        date: new Date(),
      });
    } catch (e) {
      console.error('[endTrip] parent alert for undropped kid failed:', e);
    }
  }
}




// async startTrip(driverId: string, createTripDto: CreateTripDto) {

//   const driverObjectId = new Types.ObjectId(driverId);
//   console.log(driverObjectId)
  
//   const driver = await this.databaseService.repositories.driverModel.findById(driverObjectId);
//   if (!driver) {
//     throw new UnauthorizedException('Driver not found');
//   }


  


//  const van = await this.databaseService.repositories.VanModel.findOne({ driverId: driverObjectId });
//   if (!van) {
//     throw new BadRequestException('Van not assigned to this driver');
//   }

  

//   const schoolId = van.schoolId;
  
//   if (!schoolId) {  
//     throw new BadRequestException('Van is not associated with any school');
//   }
  
//    if (driver.schoolId !== van.schoolId) {
//     throw new BadRequestException('Driver and Van school do not match');
//   }

//    if (van.status !== "active") {
//     throw new BadRequestException('Van is not active');
//   }
   

//   if (!createTripDto.routeId) {
//     throw new BadRequestException('Route ID is required to start a trip');
//   }

//   const today = new Date();
//   today.setHours(0, 0, 0, 0);

//     const tomorrow = new Date(today);
//     tomorrow.setDate(tomorrow.getDate() + 1);

//   const getTrip = await this.databaseService.repositories.TripModel.findOne({ 
//     routeId: createTripDto.routeId, 
//     type: createTripDto.type,
//     createdAt: {
//     $gte: today,     
//     $lt: tomorrow   
//       } 
//     });
//     if(getTrip){
//       throw new BadRequestException('this schedule trip already started');
//     }
  

//   const newTrip = new this.databaseService.repositories.TripModel({
//     driverId: driverId,
//     vanId: van._id.toString(),
//     schoolId: van.schoolId,
//     routeId: createTripDto.routeId,

//     type: createTripDto.type || undefined,
   

//     tripStart: {
//       startTime: new Date(),
//       lat: createTripDto.lat,
//       long: createTripDto.long,
//     },

//     status: 'ongoing',

//     kids: [],

  
//     locations: (createTripDto.lat && createTripDto.long)
//       ? [{
//           lat: createTripDto.lat,
//           long: createTripDto.long,
//           time: new Date(), 
//         }]
//       : [],
//   });

//   // 🔍 Save karo
//   const savedTrip = await newTrip.save();

//   return {
//     data: savedTrip.toObject(),
//   };
// }


async pickStudent(driverId, dto: PickStudentDto) {
  const driverObjectId = new Types.ObjectId(driverId);

  const driver = await this.databaseService.repositories.driverModel.findById(driverObjectId);
  if (!driver) {
    throw new UnauthorizedException('Driver not found');
  }

  const van = await this.databaseService.repositories.VanModel.findOne({ driverId: driverObjectId });
  if (!van) {
    throw new BadRequestException('Van not assigned to this driver');
  }

  const schoolId = van.schoolId;
  
  if (!schoolId) {  
    throw new BadRequestException('Van is not associated with any school');
  }
  
   if (driver.schoolId !== van.schoolId) {
    throw new BadRequestException('Driver and Van school do not match');
    
  }

  const tripObjectId = new Types.ObjectId(dto.tripId);

  console.log(tripObjectId)
  

   


  const trip = await this.databaseService.repositories.TripModel.findById(tripObjectId);
  if (!trip) {
    throw new NotFoundException('Trip not found');
  }

  if (trip.vanId !== van._id.toString()) {
    throw new BadRequestException("Van does not belong to this trip");
  }

  if (van.status !== "active") {
    throw new BadRequestException('Van is not active');
  }

const kid = await this.databaseService.repositories.KidModel.findById(dto.kidId);

 if (kid.status !== "active")
  {
    throw new BadRequestException('Kid is not active');
  } 


  
  

  trip.kids.push({
    kidId: dto.kidId,
    lat: dto.lat,
    long: dto.long,
    time: dto.time || new Date(),
    status: 'picked',
  });

  await trip.save();


  

  if (kid?.parentId) {
   const parent = await this.databaseService.repositories.parentModel.findOne({
  _id: kid.parentId,
  isDelete: false,

});

    const title = "Kid Picked";
    const message = `${kid.fullname} has been picked by the van driver.`;

   
    if (parent?.fcmToken && parent.notificationToggle === true) {
      await this.firebaseAdminService.sendToDevice(
        parent.fcmToken,
        {
          notification: {
            title,
            body: message,
          },
          data: {
            kidId: kid._id.toString(),
            status: 'picked',
            time: new Date().toISOString(),
          }
        }
      );
    }

 
    await this.databaseService.repositories.notificationModel.create({
      type: "driver",
      schoolId: van.schoolId,
      infoType: "Information",
      parentId: kid.parentId.toString(),
      VanId: van._id.toString(),
      title: title,
      message: message,
      actionType: "PICKED",
      status: "sent",
      date: new Date(),
    });
  }

  return {
    message: "Kid picked, notification sent & saved",
    data: trip
  };
}

async dropStudentForHome(driverId: string, dto: { tripId: string; kidId: string; lat: number; long: number }) {

  const driverObjectId = new Types.ObjectId(driverId);

  // 1️⃣ Driver check
  const driver = await this.databaseService.repositories.driverModel.findById(driverObjectId);
  if (!driver) {
    throw new UnauthorizedException('Driver not found');
  }

  // 2️⃣ Van check
  const van = await this.databaseService.repositories.VanModel.findOne({ driverId: driverObjectId });
  if (!van) {
    throw new BadRequestException('Van not assigned to this driver');
  }

  if (!van.schoolId) {
    throw new BadRequestException('Van is not associated with any school');
  }

  if (driver.schoolId !== van.schoolId) {
    throw new BadRequestException('Driver and Van school do not match');
  }

  if (van.status !== "active") {
    throw new BadRequestException('Van is not active');
  }

  // 3️⃣ Trip check
  const trip = await this.databaseService.repositories.TripModel.findById(dto.tripId);
  if (!trip) {
    throw new NotFoundException('Trip not found');
  }

  if (trip.vanId !== van._id.toString()) {
    throw new BadRequestException("Van does not belong to this trip");
  }

  // 4️⃣ Kid find in trip.kids array
  const kidIndex = trip.kids.findIndex(
    (k) => k.kidId.toString() === dto.kidId
  );

  if (kidIndex === -1) {
    throw new BadRequestException("Kid not found in this trip");
  }

  // 5️⃣ Update kid data
  trip.kids[kidIndex].status = "dropped"; // ✅ status update
  trip.kids[kidIndex].lat = dto.lat;      // ✅ location add
  trip.kids[kidIndex].long = dto.long;
  trip.kids[kidIndex].time = new Date();

  // 6️⃣ Add in locations array
  trip.locations.push({
    lat: dto.lat,
    long: dto.long,
    time: new Date(),
  });

  await trip.save();

  // 7️⃣ Notification (optional but recommended)
  const kid = await this.databaseService.repositories.KidModel.findById(dto.kidId);

  if (kid?.parentId) {

    const parent = await this.databaseService.repositories.parentModel.findOne({
      _id: kid.parentId,
      isDelete: false,
    });

    const title = "Kid Dropped";
    const message = `${kid.fullname} has been dropped at home.`;

    // 🔔 push
    if (parent?.fcmToken && parent.notificationToggle === true) {
      await this.firebaseAdminService.sendToDevice(
        parent.fcmToken,
        {
          notification: {
            title,
            body: message,
          },
          data: {
            kidId: kid._id.toString(),
            status: 'dropped',
            time: new Date().toISOString(),
          }
        }
      );
    }

    // 💾 save notification
    await this.databaseService.repositories.notificationModel.create({
      type: "driver",
      schoolId: van.schoolId,
      infoType: "Information",
      parentId: kid.parentId.toString(),
      VanId: van._id.toString(),
      title: title,
      message: message,
      actionType: "DROPPED",
      status: "sent",
      date: new Date(),
    });
  }

  return {
    message: "Kid dropped successfully",
    data: trip,
  };
}

// async endTrip(driverId, dto: EndTripDto) {
//   const { tripId, lat, long, time } = dto;
//   const driverObjectId = new Types.ObjectId(driverId);


//   const driver = await this.databaseService.repositories.driverModel.findById(driverObjectId);
//   if (!driver) throw new UnauthorizedException('Driver not found');


//   const van = await this.databaseService.repositories.VanModel.findOne({ driverId: driverObjectId });
//   if (!van) throw new BadRequestException('Van not assigned to this driver');

//   const schoolId = van.schoolId;
  
//   if (!schoolId) {  
//     throw new BadRequestException('Van is not associated with any school');
//   }
  
//    if (driver.schoolId !== van.schoolId) {
//     throw new BadRequestException('Driver and Van school do not match');
//   }


//   const trip = await this.databaseService.repositories.TripModel.findById(tripId);
//   if (!trip) throw new NotFoundException('Trip not found');

//   if (trip.vanId !== van._id.toString()) {
//     throw new BadRequestException("Van does not belong to this trip");
//   }

//   trip.kids = trip.kids.map(kid => ({
//     ...kid,
//     status: 'dropped',
//     time: time ? new Date(time) : new Date(),
//     lat,
//     long,
//   }));

//   trip.status = 'end';
//   trip.tripEnd = {
//     endTime: time ? new Date(time) : new Date(),
//     lat,
//     long,
//   };

//   await trip.save();


//   for (const kidEntry of trip.kids) {

//     const kidDoc = await this.databaseService.repositories.KidModel.findById(kidEntry.kidId);
//     const SchoolId = kidDoc?.schoolId;
//     if (!kidDoc?.parentId) continue; // agar parentId nahi hai to skip

   
//   const parent = await this.databaseService.repositories.parentModel.findOne({
//     _id: kidDoc.parentId,
//     isDelete: false,
//   });
  
//     if (!parent) continue;

    
// const title = "Student Dropped";
// const message = `${kidDoc.fullname} has been safely dropped.`;



//     if (parent?.fcmToken) {
//       await this.firebaseAdminService.sendToDevice(
//         parent.fcmToken,
//         {
//           notification: { title, body: message },
//           data: {
//             kidId: kidDoc._id.toString(),
//             status: 'dropped',
//             tripId: trip._id.toString(),
//             time: new Date().toISOString(),
//           },
//         }
//       );
//     }


//     await this.databaseService.repositories.notificationModel.create({
//       type: "driver",
//       infoType: "Information",
//       parentId: kidDoc.parentId.toString(),
//       schoolId: SchoolId,
//       VanId: van._id.toString(),
//       title: title,
//       message: message,
//       actionType: "DROPPED",
//       status: "sent",
//       date: new Date(),
//     });
//   }

//   return {
//     message: "Trip ended, notifications sent & saved",
//     data: trip,
//   };
// }

async endTrip(driverId, dto: EndTripDto) {
  const { tripId, lat, long, time } = dto;
  const driverObjectId = new Types.ObjectId(driverId);

  // 1️⃣ Driver check
  const driver = await this.databaseService.repositories.driverModel.findById(driverObjectId);
  if (!driver) throw new UnauthorizedException('Driver not found');

  // 2️⃣ Van check
  const van = await this.databaseService.repositories.VanModel.findOne({ driverId: driverObjectId });
  if (!van) throw new BadRequestException('Van not assigned to this driver');

  const schoolId = van.schoolId;

  if (!schoolId) {
    throw new BadRequestException('Van is not associated with any school');
  }

  if (driver.schoolId !== van.schoolId) {
    throw new BadRequestException('Driver and Van school do not match');
  }

  // 3️⃣ Trip check
  const trip = await this.databaseService.repositories.TripModel.findById(tripId);
  if (!trip) throw new NotFoundException('Trip not found');

  if (trip.vanId !== van._id.toString()) {
    throw new BadRequestException("Van does not belong to this trip");
  }

  // 🛡️ Child-left-behind check (drop trips). Throws 409 unless forced.
  const forcedKids = await this.checkKidsDroppedBeforeEnd(trip, dto);
  const forcedIds = new Set(forcedKids.map(k => k.kidId));

  // 4️⃣ Update trip kids status (kids from a forced end stay 'picked' —
  // nobody confirmed they got off the van).
  trip.kids = trip.kids.map(kid => forcedIds.has(kid.kidId?.toString()) ? kid : ({
    ...kid,
    status: 'dropped',
    time: time ? new Date(time) : new Date(),
    lat,
    long,
  }));

  trip.status = 'end';
  trip.tripEnd = {
    endTime: time ? new Date(time) : new Date(),
    lat,
    long,
  };

  await trip.save();

  // ===============================
  // 🔥 NEW LOGIC STARTS HERE
  // ===============================

  if (forcedKids.length) {
    await this.notifyForcedEnd(trip, van, driver, forcedKids, dto.confirmationNote.trim());
  }

  // 5️⃣ Get all kids data (only kids actually dropped get "safely dropped")
  const kidIds = trip.kids
    .filter(k => !forcedIds.has(k.kidId?.toString()))
    .map(k => new Types.ObjectId(k.kidId));

  const kids = await this.databaseService.repositories.KidModel.find(
    { _id: { $in: kidIds } },
    { parentId: 1, fullname: 1, schoolId: 1 }
  );

  // 6️⃣ Unique parents
  const uniqueParentIds = [
    ...new Set(
      kids
        .filter(k => k.parentId)
        .map(k => k.parentId.toString())
    ),
  ];

  // 7️⃣ Send notification parent-wise
  for (const parentId of uniqueParentIds) {

    const parent = await this.databaseService.repositories.parentModel.findOne({
      _id: parentId,
      isDelete: false,
    });

    if (!parent) continue;

    // 👉 is parent ke kids
    const kidsOfParent = kids.filter(
      k => k.parentId && k.parentId.toString() === parentId
    );

    const kidNames = kidsOfParent.map(k => k.fullname).join(", ");

    const title = "Student Dropped";
    const message = `Your child ${kidNames} has been safely dropped.`;

    // 🔔 Push Notification
    if (parent.fcmToken && parent.notificationToggle === true) {
      await this.firebaseAdminService.sendToDevice(
        parent.fcmToken,
        {
          notification: { title, body: message },
      data: {
       kidIds: JSON.stringify(kidsOfParent.map(k => k._id.toString())), // ✅ string
       status: 'dropped',
        tripId: trip._id.toString(),
         time: new Date().toISOString(),
}
        }
      );
    }

    // 🗄️ Save Notification
    await this.databaseService.repositories.notificationModel.create({
      type: "driver",
      infoType: "Information",
      parentId: parentId,
      schoolId: kidsOfParent[0]?.schoolId,
      VanId: van._id.toString(),
      title: title,
      message: message,
      actionType: "DROPPED",
      status: "sent",
      date: new Date(),
    });
  }

  // ===============================
  // 🔥 END
  // ===============================

  return {
    message: "Trip ended, notifications sent & saved",
    data: trip,
    ...(forcedKids.length ? { undroppedKids: forcedKids } : {}),
  };
}

async startTrip(driverId: string, createTripDto: CreateTripDto) {

  const driverObjectId = new Types.ObjectId(driverId);

  // 1️⃣ Driver check
  const driver = await this.databaseService.repositories.driverModel.findById(driverObjectId);
  if (!driver) {
    throw new UnauthorizedException('Driver not found');
  }

  // 2️⃣ Van check
  const van = await this.databaseService.repositories.VanModel.findOne({ driverId: driverObjectId });
  if (!van) {
    throw new BadRequestException('Van not assigned to this driver');
  }

  if (!van.schoolId) {
    throw new BadRequestException('Van is not associated with any school');
  }

  if (driver.schoolId !== van.schoolId) {
    throw new BadRequestException('Driver and Van school do not match');
  }

  if (van.status !== "active") {
    throw new BadRequestException('Van is not active');
  }

  // 3️⃣ Route check
  if (!createTripDto.routeId) {
    throw new BadRequestException('Route ID is required to start a trip');
  }

  const route = await this.databaseService.repositories.routeModel.findById(createTripDto.routeId);

  if (!route) {
    throw new BadRequestException('Route not found');
  }

  if (!route.startTime) {
    throw new BadRequestException('Route start time not defined');
  }

  // 🛡️ Pre-trip vehicle check (opt-in via REQUIRE_PRETRIP_CHECKLIST=true)
  if (isChecklistRequired()) {
    const done = await this.databaseService.repositories.pretripChecklistModel.exists({
      vanId: van._id.toString(),
      date: checklistDate(TZ),
    });
    if (!done) {
      throw new ConflictException({
        success: false,
        code: 'CHECKLIST_REQUIRED',
        message: 'Please complete today\'s vehicle checklist before starting a trip.',
      });
    }
  }

  // 4️⃣ ⏰ Time validation (1 hour window)
  const now = new Date();

  const routeTime = new Date(route.startTime);

  // 👉 Aaj ki date + route ka time
  const todayRouteTime = new Date();
  todayRouteTime.setHours(
    routeTime.getHours(),
    routeTime.getMinutes(),
    0,
    0
  );

  const oneHourLater = new Date(todayRouteTime.getTime() + 60 * 60 * 1000);

  if (now < todayRouteTime) {
    console.log (todayRouteTime, now, oneHourLater)
    throw new BadRequestException('Trip cannot start before scheduled time');
  }

  

  if (now > oneHourLater) {
    throw new BadRequestException('Trip start window expired (1 hour limit)');
  }

  // 5️⃣ One trip per route per day (Asia/Karachi day, not server-local —
  // the server runs in UTC, so "today" used to start at 05:00 PKT).
  const { start: dayStart, end: dayEnd } = pktDayBounds();
  const todaysTrip = await this.databaseService.repositories.TripModel.findOne({
    routeId: createTripDto.routeId,
    type: createTripDto.type,
    createdAt: { $gte: dayStart, $lt: dayEnd },
  }).sort({ createdAt: -1 });

  if (todaysTrip && todaysTrip.status === 'end') {
    // A route runs once a day. Restarting after it ended created a second
    // trip, re-notified parents and mixed up attendance.
    throw new ConflictException({
      success: false,
      code: 'TRIP_ALREADY_COMPLETED',
      message: 'This trip has already been completed today.',
    });
  }
  if (todaysTrip) {
    throw new ConflictException({
      success: false,
      code: 'TRIP_ALREADY_STARTED',
      message: 'This scheduled trip already started today.',
    });
  }

  // 6️⃣ Create trip
  const newTrip = new this.databaseService.repositories.TripModel({
    driverId: driverId,
    vanId: van._id.toString(),
    schoolId: van.schoolId,
    routeId: createTripDto.routeId,

    type: createTripDto.type || undefined,

    tripStart: {
      startTime: now,
      lat: createTripDto.lat,
      long: createTripDto.long,
    },

    status: 'ongoing',

    kids: [],

    locations: (createTripDto.lat && createTripDto.long)
      ? [{
          lat: createTripDto.lat,
          long: createTripDto.long,
          time: now,
        }]
      : [],
  });

  const savedTrip = await newTrip.save();

  return {
    message: "Trip started successfully",
    data: savedTrip.toObject(),
  };
}

async pickStudentsFromSchool(
  driverId: string,
  dto: { tripId: string; kidId: string }
) {

  const driverObjectId = new Types.ObjectId(driverId);

  // 1️⃣ Driver check
  const driver = await this.databaseService.repositories.driverModel.findById(driverObjectId);
  if (!driver) {
    throw new UnauthorizedException('Driver not found');
  }

  // 2️⃣ Van check
  const van = await this.databaseService.repositories.VanModel.findOne({ driverId: driverObjectId });
  if (!van) {
    throw new BadRequestException('Van not assigned to this driver');
  }

  if (!van.schoolId) {
    throw new BadRequestException('Van is not associated with any school');
  }

  if (driver.schoolId !== van.schoolId) {
    throw new BadRequestException('Driver and Van school do not match');
  }

  if (van.status !== "active") {
    throw new BadRequestException('Van is not active');
  }

  // 3️⃣ Trip check
  const trip = await this.databaseService.repositories.TripModel.findById(dto.tripId);
  if (!trip) {
    throw new NotFoundException('Trip not found');
  }

  if (trip.vanId !== van._id.toString()) {
    throw new BadRequestException("Van does not belong to this trip");
  }

  if (trip.type !== "drop") {
    throw new BadRequestException("This API is only for drop trips");
  }

  // 4️⃣ Single Kid fetch
  const kid = await this.databaseService.repositories.KidModel.findOne({
    _id: new Types.ObjectId(dto.kidId),
    status: "active"
  });

  if (!kid) {
    throw new BadRequestException("Kid not found or inactive");
  }

  // 5️⃣ Add kid in trip
  const kidEntry = {
    kidId: kid._id.toString(),
    time: new Date(),
    status: 'picked' as const
  };

  trip.kids.push(kidEntry);

  await trip.save();

  // 6️⃣ Notification
  if (kid.parentId) {

    const parent = await this.databaseService.repositories.parentModel.findOne({
      _id: kid.parentId,
      isDelete: false,
    });

    const title = "Kid Picked from School";
    const message = `${kid.fullname} has been picked from school.`;

    // 🔔 Push Notification
    if (parent?.fcmToken && parent.notificationToggle === true) {
      await this.firebaseAdminService.sendToDevice(
        parent.fcmToken,
        {
          notification: {
            title,
            body: message,
          },
          data: {
            kidId: kid._id.toString(),
            status: 'picked_from_school',
            time: new Date().toISOString(),
          }
        }
      );
    }

    // 💾 Save Notification
    await this.databaseService.repositories.notificationModel.create({
      type: "driver",
      schoolId: van.schoolId,
      infoType: "Information",
      parentId: kid.parentId.toString(),
      VanId: van._id.toString(),
      title: title,
      message: message,
      actionType: "PICKED_FROM_SCHOOL",
      status: "sent",
      date: new Date(),
    });
  }

  return {
    message: "Kid picked from school & added to trip",
    data: trip
  };
}

async endTripForDrop(driverId, dto: EndTripDto) {
  const { tripId, lat, long, time } = dto;
  const driverObjectId = new Types.ObjectId(driverId);

  // 1️⃣ Driver check
  const driver = await this.databaseService.repositories.driverModel.findById(driverObjectId);
  if (!driver) throw new UnauthorizedException('Driver not found');

  // 2️⃣ Van check
  const van = await this.databaseService.repositories.VanModel.findOne({ driverId: driverObjectId });
  if (!van) throw new BadRequestException('Van not assigned to this driver');

  if (!van.schoolId) {
    throw new BadRequestException('Van is not associated with any school');
  }

  if (driver.schoolId !== van.schoolId) {
    throw new BadRequestException('Driver and Van school do not match');
  }

  // 3️⃣ Trip check
  const trip = await this.databaseService.repositories.TripModel.findById(tripId);
  if (!trip) throw new NotFoundException('Trip not found');

  if (trip.vanId !== van._id.toString()) {
    throw new BadRequestException("Van does not belong to this trip");
  }

  // ✅ Only DROP trip allowed
  if (trip.type !== "drop") {
    throw new BadRequestException("This API is only for drop trips");
  }

  // ✅ Already ended check
  if (trip.status === "end") {
    throw new BadRequestException("Trip already ended");
  }

  // 🛡️ Child-left-behind check. Throws 409 unless forced.
  const forcedKids = await this.checkKidsDroppedBeforeEnd(trip, dto);

  // ❌ NO kids update

  // 4️⃣ End trip only
  trip.status = 'end';
  trip.tripEnd = {
    endTime: time ? new Date(time) : new Date(),
    lat,
    long,
  };

  await trip.save();

  if (forcedKids.length) {
    await this.notifyForcedEnd(trip, van, driver, forcedKids, dto.confirmationNote.trim());
  }

  return {
    message: "Drop trip ended successfully",
    data: trip,
    ...(forcedKids.length ? { undroppedKids: forcedKids } : {}),
  };
}



async getLocationByDriver( dto: getLocationDto) {
  const { tripId,  } = dto;






  const trip = await this.databaseService.repositories.TripModel.findById(tripId);
  if (!trip) {
    throw new NotFoundException('Trip not found');
  }
  


// ✅ Sirf required fields return karo
  return {
    data: {
      type: trip.type,
      status: trip.status,
      locations: trip.locations,
    },
  };
}



async getTripsByAdmin(
  AdminId: string,
  page: number = 1,
  limit: number = 10,
  status?: string,
  userType?: string,
  driverId?: string,
  schoolId?: string,
  date?: string
) {
  const skip = (page - 1) * limit;
  const matchCondition: any = {};

  // ==============================
  // USER TYPE LOGIC
  // ==============================
  if (userType === "admin") {
    const school = await this.databaseService.repositories.SchoolModel.findOne({
      admin: new Types.ObjectId(AdminId),
    }).lean();

    if (!school) {
      throw new UnauthorizedException("School not found");
    }

    matchCondition.schoolId = school._id.toString();
  } else if (userType === "superadmin") {
    if (schoolId) matchCondition.schoolId = schoolId;
  } else {
    throw new UnauthorizedException("Invalid user type");
  }

  // ==============================
  // STATUS FILTER
  // ==============================
  if (status) {
    matchCondition.status = status;
  }

  // ==============================
  // DATE FILTER (updatedAt day range)
  // ==============================
  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    matchCondition.updatedAt = { $gte: startOfDay, $lte: endOfDay };
  }

  // ==============================
  // DRIVER → VAN (SINGLE VAN)
  // ==============================
  if (driverId) {
    const van = await this.databaseService.repositories.VanModel.findOne(
      { driverId: new Types.ObjectId(driverId) },
      { _id: 1 }
    ).lean();

    if (!van) {
      return {
        message: "Trips fetched successfully",
        data: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
      };
    }

    matchCondition.vanId = van._id.toString();
  }

  // ==============================
  // AGGREGATION PIPELINE (NO KIDS LOOKUP)
  // ==============================
  const pipeline: any[] = [
    { $match: matchCondition },

    // VAN LOOKUP
    {
      $lookup: {
        from: "vans",
        let: { vanObjId: { $toObjectId: "$vanId" } },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$vanObjId"] } } }],
        as: "van",
      },
    },
    { $unwind: { path: "$van", preserveNullAndEmptyArrays: true } },

    // DRIVER LOOKUP
    {
      $lookup: {
        from: "drivers",
        localField: "van.driverId",
        foreignField: "_id",
        as: "driver",
      },
    },
    { $unwind: { path: "$driver", preserveNullAndEmptyArrays: true } },

    // ROUTE LOOKUP
    {
      $lookup: {
        from: "routes",
        let: { routeObjId: { $toObjectId: "$routeId" } },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$routeObjId"] } } }],
        as: "route",
      },
    },
    { $unwind: { path: "$route", preserveNullAndEmptyArrays: true } },

    // SCHOOL LOOKUP
    {
      $lookup: {
        from: "schools",
        let: { schoolObjId: { $toObjectId: "$schoolId" } },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$schoolObjId"] } } }],
        as: "school",
      },
    },
    { $unwind: { path: "$school", preserveNullAndEmptyArrays: true } },

    // FINAL FIELDS
    {
      $project: {
        _id: 1,
        status: 1,
        type: 1,
        tripStart: 1,
        tripEnd: 1,
        kids: 1, // keep original kids array (objects)
        locations: 1,
        updatedAt: 1,

        van: {
          _id: "$van._id",
          carNumber: "$van.carNumber",
          vehicleType: "$van.vehicleType",
        },

        driver: {
          _id: "$driver._id",
          fullname: "$driver.fullname",
          phoneNo: "$driver.phoneNo",
        },

        route: {
          _id: "$route._id",
          title: "$route.title",
          tripType: "$route.tripType",
        },

        schoolName: "$school.schoolName",
        contactNumber: "$school.contactNumber",
      },
    },

    { $sort: { updatedAt: -1 } },
    { $skip: skip },
    { $limit: limit },
  ];

  // ==============================
  // EXECUTE
  // ==============================
  const trips = await this.databaseService.repositories.TripModel.aggregate(pipeline);

  const total = await this.databaseService.repositories.TripModel.countDocuments(matchCondition);

  // ==============================
  // KIDS ENRICHMENT (MAP APPROACH)
  // kids: [{ kidId: "string", lat,long,time,status }]
  // ==============================
  const allKidIds: string[] = trips.flatMap((t: any) =>
    Array.isArray(t.kids) ? t.kids.map((k: any) => k?.kidId).filter(Boolean) : []
  );

  const uniqueKidIds = [...new Set(allKidIds)]
    .filter((id) => Types.ObjectId.isValid(id)); // safe check

  // If no kids, return as-is
  if (uniqueKidIds.length === 0) {
    return {
      message: "Trips fetched successfully",
      data: trips,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Fetch kids details once
  const kidsDetails = await this.databaseService.repositories.KidModel.find(
    { _id: { $in: uniqueKidIds.map((id) => new Types.ObjectId(id)) } },
    { fullname: 1, image: 1 }
  ).lean();

  const kidMap = new Map<string, any>(
    kidsDetails.map((k: any) => [k._id.toString(), k])
  );

  // Merge into trips.kids
  const updatedTrips = trips.map((trip: any) => ({
    ...trip,
    kids: Array.isArray(trip.kids)
      ? trip.kids.map((k: any) => {
          const kd = k?.kidId ? kidMap.get(k.kidId) : null;
          return {
            ...k,
            fullname: kd?.fullname ?? null,
            image: kd?.image ?? null,
          };
        })
      : [],
  }));

  return {
    message: "Trips fetched successfully",
    data: updatedTrips,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async generateGraphData(
  AdminId: string,
  adminType: "admin" | "superadmin",
  filterType: "weekly" | "monthly" | "yearly"
) {
  const adminObjectId = new Types.ObjectId(AdminId);

  // 1) Resolve time window + labels
  let start: moment.Moment;
  let end: moment.Moment;
  let labels: string[] = [];

  if (filterType === "weekly") {
    start = moment().tz(TZ).startOf("isoWeek");
    end = moment().tz(TZ).endOf("isoWeek");
    labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  } else if (filterType === "monthly") {
    start = moment().tz(TZ).startOf("month");
    end = moment().tz(TZ).endOf("month");
    const dim = start.daysInMonth();
    labels = Array.from({ length: dim }, (_, i) => String(i + 1).padStart(2, "0"));
  } else if (filterType === "yearly") {
    start = moment().tz(TZ).startOf("year");
    end = moment().tz(TZ).endOf("year");
    labels = moment.monthsShort();
  } else {
    throw new Error("Invalid filterType");
  }

  // 2) Base match for graph
  const match: any = {
    createdAt: { $gte: start.toDate(), $lte: end.toDate() },
  };

  // SchoolId store karne ke liye
  let schoolIdString: string | null = null;

  // Agar admin hai → uska school nikaalna
  if (adminType === "admin") {
    const school = await this.databaseService.repositories.SchoolModel
      .findOne({ admin: adminObjectId })
      .lean();

    if (!school) throw new UnauthorizedException("School not found");

    schoolIdString = String(school._id ?? school.id);
    match.schoolId = schoolIdString;
  }

  // 3) Group key per filter
  let groupId: any;
  if (filterType === "weekly") {
    groupId = { $isoDayOfWeek: { date: "$createdAt", timezone: TZ } }; // 1..7
  } else if (filterType === "monthly") {
    groupId = { $dateToString: { format: "%d", date: "$createdAt", timezone: TZ } };
  } else {
    groupId = { $dateToString: { format: "%m", date: "$createdAt", timezone: TZ } };
  }

  const TripModel = this.databaseService.repositories.TripModel;

  const rows: Array<{ _id: any; count: number }> = await TripModel.aggregate([
    { $match: match },
    { $group: { _id: groupId, count: { $sum: 1 } } },
  ]);

  // 4) Zero-filled map
  const map: Record<string, number> = {};
  for (const l of labels) map[l] = 0;

  // 5) Fill counts into map
  for (const r of rows) {
    if (filterType === "weekly") {
      const idx = (Number(r._id) || 1) - 1;
      const label = labels[idx];
      if (label) map[label] = r.count;
    } else if (filterType === "monthly") {
      const label = String(r._id);
      if (label in map) map[label] = r.count;
    } else {
      const monthNum = Number(r._id);
      const label = moment().month(monthNum - 1).format("MMM");
      if (label in map) map[label] = r.count;
    }
  }

  // 6) Graph data array
  const graphData = labels.map((label) => ({
    name: label,
    count: map[label] || 0,
  }));

  // --------------- EXTRA COUNTS ---------------
  const VanModel = this.databaseService.repositories.VanModel;
  const KidModel = this.databaseService.repositories.KidModel; // adjust if plural
  // TripModel already available

  // Base filter for admin (for superadmin → no filter)
  const baseCountFilter: any = {};
  if (adminType === "admin" && schoolIdString) {
    baseCountFilter.schoolId = schoolIdString;
  }

  // Parallel counts
  const [vansCount, tripsCount, kidsCount] = await Promise.all([
    VanModel.countDocuments(adminType === "admin" ? baseCountFilter : {}),
    TripModel.countDocuments(adminType === "admin" ? baseCountFilter : {}),
    KidModel.countDocuments(adminType === "admin" ? baseCountFilter : {}),
  ]);

  const driversCount = vansCount; // drivers = vans count

  // --------------- Final response ---------------
  const data = {
    graph: graphData,
    counts: {
      vans: vansCount,
      drivers: driversCount,
      trips: tripsCount,
      kids: kidsCount,
    },
  };

  return { data };
}





  async getTripsByDriver(driverId: string) {
    try {
      const { Types } = require('mongoose');
      const driverObjectId = new Types.ObjectId(driverId);
      const van = await this.databaseService.repositories.VanModel.findOne({
        driverId: driverObjectId
      }).lean();

      if (!van) {
        return { message: 'No van assigned', data: [] };
      }

      const trips = await this.databaseService.repositories.TripModel.find({
        vanId: van._id.toString()
      }).sort({ createdAt: -1 }).lean();

      // Previously returned bare trip documents (routeId as a raw string,
      // no title) — every screen showing "School Route" or a trip name
      // had nothing real to display. Enrich with each trip's route title.
      const routeIds = Array.from(new Set(trips.map((t: any) => t.routeId).filter(Boolean)));
      const routes = routeIds.length
        ? await this.databaseService.repositories.routeModel.find(
            { _id: { $in: routeIds } },
            { title: 1 },
          ).lean()
        : [];
      const routeTitleById: Record<string, string> = {};
      routes.forEach((r: any) => { routeTitleById[r._id.toString()] = r.title; });

      const enrichedTrips = trips.map((t: any) => ({
        ...t,
        schoolRoute: routeTitleById[t.routeId] || null,
      }));

      return { message: 'Trips fetched', data: enrichedTrips };
    } catch (e) {
      return { message: 'Error fetching trips', data: [] };
    }
  }
  // ─── ETA Engine ────────────────────────────────────────────────────────────

  async getETA(tripId: string, driverLat: number, driverLng: number) {
    const trip = await this.databaseService.repositories.TripModel.findById(tripId);
    if (!trip) throw new Error('Trip not found');

    const route = await this.databaseService.repositories.routeModel.findById(trip.routeId);
    if (!route) throw new Error('Route not found');

    const school = await this.databaseService.repositories.SchoolModel.findById(trip.schoolId);

    const destinations: { name: string; lat: number; lng: number }[] = [];

    if (trip.type === 'pick') {
      // ETA to school
      if (school?.lat && school?.long) {
        destinations.push({
          name: school.schoolName || 'School',
          lat: school.lat,
          lng: school.long,
        });
      }
    } else {
      // ETA to each pending kid home
      const pendingKids = trip.kids.filter(k => k.status !== 'dropped');
      if (route.kidLocations?.length) {
        for (const kl of route.kidLocations) {
          const isPending = pendingKids.some(k => k.kidId === kl.kidId.toString());
          if (isPending) {
            const kid = await this.databaseService.repositories.KidModel.findById(kl.kidId);
            destinations.push({
              name: kid?.fullname || 'Student',
              lat: kl.lat,
              lng: kl.long,
            });
          }
        }
      }
    }

    const etaResults = await this.etaService.calculateETA(driverLat, driverLng, destinations);

    return {
      message: 'ETA calculated successfully',
      tripId,
      tripType: trip.type,
      driverLocation: { lat: driverLat, lng: driverLng },
      eta: etaResults,
    };
  }

  /**
   * Called by the driver app every few seconds during a trip.
   *
   * 1. Verifies the trip is ongoing and belongs to the caller's van.
   * 2. Stores the point, accumulates distance, records overspeed.
   * 3. Geofence: school zone + home zones of kids still WAITING for the van
   *    (pick trip: not picked yet; drop trip: in the van).
   * 4. ETA to each waiting kid's stop, at most once a minute per trip
   *    (Distance Matrix is billed per element). Each parent gets one push at
   *    ~10 min and one at ~3 min — previously every location update pushed
   *    "Van is on the way" to every parent.
   * 5. Socket 'etaUpdate' to the trip room with per-kid minutes.
   */
  async updateLocationAndBroadcastETA(
    driverId: string,
    tripId: string,
    lat: number,
    lng: number,
    speedMs?: number,
  ) {
    if (typeof lat !== 'number' || typeof lng !== 'number' ||
        Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new BadRequestException('Valid lat and lng are required');
    }
    if (!Types.ObjectId.isValid(tripId)) throw new NotFoundException('Trip not found');

    const repos = this.databaseService.repositories;
    const trip = await repos.TripModel.findById(tripId);
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.status !== 'ongoing') {
      throw new BadRequestException({ success: false, code: 'TRIP_NOT_ONGOING', message: 'Trip is not in progress' });
    }
    const van: any = await repos.VanModel.findOne({ driverId: new Types.ObjectId(driverId) }).lean();
    if (!van || trip.vanId !== van._id.toString()) {
      throw new UnauthorizedException('This trip does not belong to your van');
    }

    // ── 2. Point, distance, speed ────────────────────────────────────────
    const now = new Date();
    const last = trip.locations[trip.locations.length - 1];
    if (last) {
      const seg = this.geofenceService.getDistanceMeters(last.lat, last.long, lat, lng);
      if (seg <= MAX_SEGMENT_METERS) trip.distanceMeters = (trip.distanceMeters || 0) + seg;
    }
    trip.locations.push({ lat, long: lng, time: now });

    const kmh = speedKmh(speedMs);
    let overspeed: { speedKmh: number; limitKmh: number } | null = null;
    if (kmh !== null) {
      if (kmh > (trip.maxSpeedKmh || 0)) trip.maxSpeedKmh = kmh;
      const limit = overspeedLimitKmh();
      if (kmh > limit) {
        const lastEvt = trip.overspeedEvents[trip.overspeedEvents.length - 1];
        // One recorded event per minute of continuous speeding.
        if (!lastEvt || now.getTime() - new Date(lastEvt.time).getTime() > 60_000) {
          trip.overspeedEvents.push({ speedKmh: kmh, lat, long: lng, time: now });
        }
        overspeed = { speedKmh: kmh, limitKmh: limit };
      }
    }

    // ── 3. Geofence ──────────────────────────────────────────────────────
    const prevInsideZones: string[] = trip.insideZoneIds || [];
    const zones: GeofenceZone[] = [];
    const school = await repos.SchoolModel.findById(trip.schoolId);
    if (school?.lat && school?.long) {
      zones.push({
        id: 'school_' + school._id.toString(),
        name: school.schoolName || 'School',
        lat: school.lat,
        lng: school.long,
        radiusMeters: 150,
        type: 'school',
      });
    }

    const route = await repos.routeModel.findById(trip.routeId);
    const routeKidIds = (route?.kidLocations || []).map(kl => kl.kidId.toString());
    const waiting = new Set(waitingKidIds(trip.type, routeKidIds, trip.kids));
    // Kids marked absent for this trip, or skipped as no-show, aren't waiting.
    for (const id of await this.absentKidIdsToday(routeKidIds, trip.type)) waiting.delete(id);
    for (const ns of trip.noShows || []) waiting.delete(ns.kidId);

    // kidId → { stop, kid, parent } for waiting kids
    const stops = new Map<string, { lat: number; lng: number; kid: any; parent: any }>();
    for (const kl of route?.kidLocations || []) {
      const kidId = kl.kidId.toString();
      if (!waiting.has(kidId) || stops.has(kidId)) continue;
      const kid: any = await repos.KidModel.findById(kl.kidId);
      if (!kid) continue;
      const parent: any = kid.parentId
        ? await repos.parentModel.findOne({ _id: kid.parentId, isDelete: false })
        : null;
      stops.set(kidId, { lat: kl.lat, lng: kl.long, kid, parent });
      zones.push({
        id: 'home_' + kidId,
        name: kid.fullname || 'Student Home',
        lat: kl.lat,
        lng: kl.long,
        radiusMeters: 100,
        type: 'home',
        kidId,
        parentId: kid.parentId?.toString(),
        parentFcmToken: parent?.fcmToken || undefined,
      });
    }

    const { events, nowInsideZoneIds } = this.geofenceService.checkZones(lat, lng, zones, prevInsideZones);
    trip.insideZoneIds = nowInsideZoneIds;
    const pendingKids = trip.kids.filter(k => k.status !== 'dropped');

    for (const evt of events) {
      let title = '';
      let body = '';
      let actionType = '';
      if (evt.zoneType === 'school' && evt.event === 'entered') {
        title = 'Van reached school';
        body = 'The van has arrived at school.';
        actionType = 'GEOFENCE_SCHOOL_ENTERED';
      } else if (evt.zoneType === 'school' && evt.event === 'exited') {
        title = 'Van left school';
        body = 'The van has departed from school.';
        actionType = 'GEOFENCE_SCHOOL_EXITED';
      } else if (evt.zoneType === 'home' && evt.event === 'entered') {
        title = 'Van is nearby!';
        body = evt.zoneName + ' — van is arriving at your location.';
        actionType = 'GEOFENCE_HOME_ENTERED';
      } else {
        // Leaving a home zone isn't useful to parents — skip the push.
        continue;
      }

      if (evt.zoneType === 'home') {
        if (evt.parentFcmToken) {
          try {
            await this.firebaseAdminService.sendToDevice(evt.parentFcmToken, {
              notification: { title, body },
              data: {
                tripId, type: actionType, zoneId: evt.zoneId, zoneName: evt.zoneName,
                kidId: evt.kidId || '', driverLat: String(lat), driverLng: String(lng),
              },
            });
          } catch (e) {
            console.error('Geofence FCM error:', e.message);
          }
        }
        if (evt.parentId) {
          await repos.notificationModel.create({
            type: 'driver', infoType: 'Geofence', parentId: evt.parentId,
            schoolId: trip.schoolId, VanId: trip.vanId, title, message: body,
            actionType, status: 'sent', date: now,
          });
        }
        continue;
      }

      // School event — parents of kids currently on the trip
      for (const kidEntry of pendingKids) {
        const kid = await repos.KidModel.findById(kidEntry.kidId);
        if (!kid?.parentId) continue;
        const parent = await repos.parentModel.findOne({ _id: kid.parentId, isDelete: false });
        if (parent?.fcmToken && parent.notificationToggle === true) {
          try {
            await this.firebaseAdminService.sendToDevice(parent.fcmToken, {
              notification: { title, body },
              data: { tripId, type: actionType, driverLat: String(lat), driverLng: String(lng) },
            });
          } catch (e) {
            console.error('School geofence FCM error:', e.message);
          }
        }
        await repos.notificationModel.create({
          type: 'driver', infoType: 'Geofence', parentId: kid.parentId.toString(),
          schoolId: trip.schoolId, VanId: trip.vanId, title, message: body,
          actionType, status: 'sent', date: now,
        });
      }
    }

    // ── 4. ETA (throttled) + threshold pushes ────────────────────────────
    let eta: { kidId: string; minutes: number; etaTime: string; distanceMeters: number }[] = [];
    const cached = etaCache.get(tripId);
    if (cached && now.getTime() - cached.at < ETA_REFRESH_MS) {
      eta = cached.eta.filter(e => waiting.has(e.kidId));
    } else if (stops.size) {
      const ids = [...stops.keys()].slice(0, 25); // Distance Matrix limit
      const results = await this.etaService.calculateETA(
        lat, lng,
        ids.map(id => ({ name: id, lat: stops.get(id).lat, lng: stops.get(id).lng })),
      );
      eta = results
        .map((r, i) => ({
          kidId: ids[i],
          minutes: Math.max(1, Math.round(r.durationSeconds / 60)),
          etaTime: r.etaTime,
          distanceMeters: r.distanceMeters,
          ok: r.durationSeconds > 0,
        }))
        .filter(r => r.ok)
        .map(({ ok, ...r }) => r);
      etaCache.set(tripId, { at: now.getTime(), eta });

      const sent = [...(trip.etaAlertsSent || [])];
      for (const e of eta) {
        const push = etaPushToSend(e.kidId, e.minutes, sent);
        if (!push) continue;
        sent.push(...push.markSent.filter(k => !sent.includes(k)));
        const stop = stops.get(e.kidId);
        const parent = stop?.parent;
        if (!parent?.fcmToken || parent.notificationToggle !== true) continue;
        const name = stop.kid?.fullname || 'your child';
        const title = push.threshold <= 3 ? 'Van almost there' : 'Van on the way';
        const body = trip.type === 'pick'
          ? `Please get ${name} ready — the van is about ${e.minutes} min away (${e.etaTime}).`
          : `The van with ${name} is about ${e.minutes} min from home (${e.etaTime}).`;
        try {
          await this.firebaseAdminService.sendToDevice(parent.fcmToken, {
            notification: { title, body },
            data: {
              tripId, type: 'ETA_UPDATE', kidId: e.kidId,
              etaMinutes: String(e.minutes), etaTime: e.etaTime,
              driverLat: String(lat), driverLng: String(lng),
            },
          });
        } catch (err) {
          console.error('ETA FCM error:', err.message);
        }
      }
      trip.etaAlertsSent = sent;
    }

    await trip.save();

    // ── Overspeed alert to school (max once per 5 min per trip) ──────────
    if (overspeed) {
      const lastAlert = trip.lastOverspeedAlertAt ? new Date(trip.lastOverspeedAlertAt).getTime() : 0;
      if (now.getTime() - lastAlert > 5 * 60_000) {
        await repos.TripModel.updateOne({ _id: trip._id }, { $set: { lastOverspeedAlertAt: now } });
        try {
          const driver: any = await repos.driverModel.findById(driverId, { fullname: 1 }).lean();
          const driverName = driver?.fullname || 'Driver';
          const message = `${driverName}${van.carNumber ? ` (van ${van.carNumber})` : ''} was driving at ` +
            `${overspeed.speedKmh} km/h (limit ${overspeed.limitKmh}). https://maps.google.com/?q=${lat},${lng}`;
          const alert = await repos.notificationModel.create({
            type: 'overspeed', alertType: 'OVERSPEED', recipientType: 'ADMIN', infoType: 'Warning',
            driverId, schoolId: van.schoolId, VanId: van._id.toString(),
            title: 'Overspeeding', message, status: 'sent', date: now,
          });
          this.eventsGateway.emitToSchool(van.schoolId, 'overspeedAlert', {
            alertId: alert._id.toString(), tripId, driverId, driverName,
            vanId: van._id.toString(), speedKmh: overspeed.speedKmh,
            limitKmh: overspeed.limitKmh, location: { lat, lng }, at: now.toISOString(),
          });
        } catch (e) {
          console.error('[overspeed] alert failed:', e);
        }
      }
    }

    // ── 5. Live ETA for parents watching the map ─────────────────────────
    this.eventsGateway.emitToRoom(tripId, 'etaUpdate', {
      tripId,
      at: now.toISOString(),
      eta: eta.map(e => ({ kidId: e.kidId, minutes: e.minutes, etaTime: e.etaTime })),
    });

    return {
      message: 'Location updated',
      location: { lat, lng },
      geofenceEvents: events.map(e => ({
        zone: e.zoneName, type: e.zoneType, event: e.event, distanceMeters: e.distanceMeters,
      })),
      eta,
      ...(overspeed ? { overspeed } : {}),
    };
  }

  // ─── Driver stats ───────────────────────────────────────────────────────

  /** Last [days] days of ended trips for the driver's van. */
  async getDriverStats(driverId: string, days = 7) {
    const span = Math.min(Math.max(Math.floor(days) || 7, 1), 90);
    const repos = this.databaseService.repositories;
    const van: any = await repos.VanModel.findOne({ driverId: new Types.ObjectId(driverId) }).lean();
    if (!van) throw new BadRequestException('Van not assigned to this driver');

    const since = new Date(Date.now() - span * 24 * 60 * 60 * 1000);
    const trips: any[] = await repos.TripModel.find(
      { vanId: van._id.toString(), status: 'end', createdAt: { $gte: since } },
      { locations: 0 },
    ).lean();

    const routeIds = [...new Set(trips.map(t => t.routeId).filter(id => Types.ObjectId.isValid(id)))];
    const routes: any[] = await repos.routeModel.find({ _id: { $in: routeIds } }, { startTime: 1 }).lean();
    const startByRoute = new Map(routes.map(r => [r._id.toString(), r.startTime]));

    let distance = 0;
    let durationMin = 0;
    let overspeedCount = 0;
    let maxSpeed = 0;
    let onTime = 0;
    let timed = 0;
    let kidsDropped = 0;
    for (const t of trips) {
      distance += t.distanceMeters || 0;
      overspeedCount += (t.overspeedEvents || []).length;
      maxSpeed = Math.max(maxSpeed, t.maxSpeedKmh || 0);
      kidsDropped += (t.kids || []).filter((k: any) => k.status === 'dropped').length;
      const start = t.tripStart?.startTime ? new Date(t.tripStart.startTime) : null;
      const end = t.tripEnd?.endTime ? new Date(t.tripEnd.endTime) : null;
      if (start && end && end > start) durationMin += (end.getTime() - start.getTime()) / 60000;

      // On time = started within 10 minutes of the route's scheduled start.
      const scheduled = startByRoute.get(t.routeId);
      if (start && scheduled) {
        // route.startTime is stored as a Date; only its time of day matters.
        const local = moment(start).tz(TZ);
        const schedTime = moment(new Date(scheduled)).tz(TZ);
        const sched = local.clone().set({
          hour: schedTime.hour(), minute: schedTime.minute(), second: 0, millisecond: 0,
        });
        if (sched.isValid()) {
          timed++;
          if (local.diff(sched, 'minutes') <= 10) onTime++;
        }
      }
    }

    // Simple 0–100 score: start at 100, minus 5 per overspeed event, minus
    // up to 20 for late starts.
    const latePenalty = timed ? Math.round(((timed - onTime) / timed) * 20) : 0;
    const safetyScore = Math.max(0, 100 - overspeedCount * 5 - latePenalty);

    return {
      success: true,
      data: {
        days: span,
        trips: trips.length,
        distanceKm: Math.round(distance / 100) / 10,
        drivingMinutes: Math.round(durationMin),
        kidsDropped,
        overspeedCount,
        maxSpeedKmh: maxSpeed,
        onTimePercent: timed ? Math.round((onTime / timed) * 100) : null,
        safetyScore,
        speedLimitKmh: overspeedLimitKmh(),
      },
    };
  }

  // ─── Digital Attendance ─────────────────────────────────────────────────

  async getDailyAttendance(
    adminId: string,
    adminRole: string,
    date?: string,
    vanId?: string,
    schoolId?: string,
  ) {
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Resolve schoolId
    let resolvedSchoolId = schoolId;
    if (adminRole === 'admin') {
      const school = await this.databaseService.repositories.SchoolModel.findOne({
        admin: new Types.ObjectId(adminId),
      }).lean();
      if (!school) throw new Error('School not found');
      resolvedSchoolId = school._id.toString();
    }

    const matchCondition: any = {
      createdAt: { $gte: startOfDay, $lte: endOfDay },
      status: 'end',
    };
    if (resolvedSchoolId) matchCondition.schoolId = resolvedSchoolId;
    if (vanId) matchCondition.vanId = vanId;

    const trips = await this.databaseService.repositories.TripModel
      .find(matchCondition)
      .lean();

    // Start from the FULL active roster for this school (and van, if
    // filtered), not just whichever kids happened to appear in a
    // completed trip today. Previously, a student whose van never ran at
    // all that day (driver absent, no trip started, etc.) had zero trip
    // entries and was silently omitted entirely — not counted "absent",
    // just missing — which shrank the denominator and made the
    // attendance rate look artificially high on exactly the days it
    // should have looked worse.
    const rosterFilter: any = { status: 'active' };
    if (resolvedSchoolId) rosterFilter.schoolId = resolvedSchoolId;
    if (vanId) rosterFilter.VanId = vanId;
    const rosterKids = await this.databaseService.repositories.KidModel.find(rosterFilter).lean();

    if (!rosterKids.length) {
      return {
        message: 'Attendance report generated',
        date: targetDate.toISOString().split('T')[0],
        totalStudents: 0,
        present: 0,
        absent: 0,
        records: [],
      };
    }

    // Collect all kidIds from all trips
    const allKidEntries: any[] = [];
    for (const trip of trips) {
      for (const k of trip.kids || []) {
        allKidEntries.push({
          kidId: k.kidId,
          status: k.status,
          time: k.time,
          lat: k.lat,
          long: k.long,
          tripId: trip._id.toString(),
          tripType: trip.type,
          vanId: trip.vanId,
          schoolId: trip.schoolId,
          tripStart: trip.tripStart?.startTime,
          tripEnd: trip.tripEnd?.endTime,
        });
      }
    }

    const uniqueKidIds = rosterKids.map((k: any) => k._id.toString());
    const kidMap = new Map(rosterKids.map((k: any) => [k._id.toString(), k]));

    // Fetch parent contact info — the whole point of a follow-up report
    // is being able to actually call the parent of an absent student.
    const parentIds = [...new Set(rosterKids.map((k: any) => k.parentId?.toString()).filter(Boolean))];
    const parents = await this.databaseService.repositories.parentModel.find({
      _id: { $in: parentIds.map(id => new Types.ObjectId(id)) },
    }).lean();
    const parentMap = new Map(parents.map((p: any) => [p._id.toString(), p]));

    // Fetch van details — include every roster kid's own assigned van too,
    // not just vans that had a trip today, so a student whose van never
    // ran still shows their real van number instead of "N/A".
    const vanIds = [...new Set([
      ...trips.map(t => t.vanId),
      ...rosterKids.map((k: any) => k.VanId).filter(Boolean),
    ])];
    const vans = await this.databaseService.repositories.VanModel.find({
      _id: { $in: vanIds.map(id => new Types.ObjectId(id)) },
    }).lean();
    const vanMap = new Map(vans.map((v: any) => [v._id.toString(), v]));

    // Build attendance records per kid
    const records = uniqueKidIds.map(kidId => {
      const kid: any = kidMap.get(kidId);
      const entries = allKidEntries.filter(e => e.kidId === kidId);
      const pickEntry = entries.find(e => e.tripType === 'pick');
      const dropEntry = entries.find(e => e.tripType === 'drop');
      const van: any = vanMap.get(entries[0]?.vanId) ?? (kid?.VanId ? vanMap.get(kid.VanId) : undefined);
      const parent: any = kid?.parentId ? parentMap.get(kid.parentId.toString()) : undefined;

      // Determine attendance status
      let attendanceStatus = 'present';
      let remarks = '';

      if (!pickEntry && !dropEntry) {
        attendanceStatus = 'absent';
        remarks = entries.length > 0
          ? 'On the route but never marked picked up or dropped'
          : 'No trip ran for this student\'s van today';
      } else if (pickEntry?.status === 'picked' || dropEntry?.status === 'dropped') {
        attendanceStatus = 'present';
        // Check if late — picked more than 15 mins after trip start
        if (pickEntry?.time && pickEntry?.tripStart) {
          const pickTime = new Date(pickEntry.time).getTime();
          const startTime = new Date(pickEntry.tripStart).getTime();
          const diffMins = (pickTime - startTime) / 60000;
          if (diffMins > 15) {
            attendanceStatus = 'late';
            remarks = 'Picked ' + Math.round(diffMins) + ' mins after trip start';
          }
        }
      }

      return {
        kidId,
        fullname: kid?.fullname || 'Unknown',
        image: kid?.image || null,
        schoolId: entries[0]?.schoolId,
        vanNumber: van?.carNumber || 'N/A',
        parentName: parent?.fullname || 'Unknown',
        parentPhone: parent?.phoneNo || '',
        attendanceStatus,
        remarks,
        pickupTime: pickEntry?.time || null,
        pickupLat: pickEntry?.lat || null,
        pickupLng: pickEntry?.long || null,
        dropTime: dropEntry?.time || null,
        dropLat: dropEntry?.lat || null,
        dropLng: dropEntry?.long || null,
        tripId: entries[0]?.tripId,
      };
    });

    const present = records.filter(r => r.attendanceStatus === 'present').length;
    const late = records.filter(r => r.attendanceStatus === 'late').length;
    const absent = records.filter(r => r.attendanceStatus === 'absent').length;

    return {
      message: 'Attendance report generated',
      date: targetDate.toISOString().split('T')[0],
      totalStudents: records.length,
      present,
      late,
      absent,
      presentRate: records.length > 0
        ? Math.round(((present + late) / records.length) * 100)
        : 0,
      records,
    };
  }

  async getStudentAttendanceHistory(
    kidId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
      start.setTime(end.getTime() - MAX_RANGE_MS);
    }

    const kid: any = await this.databaseService.repositories.KidModel.findById(kidId).lean();
    if (!kid) throw new Error('Student not found');

    // Don't count days before this student was even enrolled as absences.
    const enrolledAt = kid.createdAt ? new Date(kid.createdAt) : start;
    const effectiveStart = enrolledAt > start ? enrolledAt : start;
    effectiveStart.setHours(0, 0, 0, 0);

    const trips = await this.databaseService.repositories.TripModel.find({
      'kids.kidId': kidId,
      status: 'end',
      createdAt: { $gte: effectiveStart, $lte: end },
    }).lean();

    // Group by date
    const byDate: Record<string, any> = {};

    for (const trip of trips) {
      const dateKey = new Date((trip as any).createdAt).toISOString().split('T')[0];
      if (!byDate[dateKey]) byDate[dateKey] = { date: dateKey, trips: [] };

      const kidEntry = (trip.kids || []).find((k: any) => k.kidId === kidId);
      if (kidEntry) {
        byDate[dateKey].trips.push({
          tripId: trip._id.toString(),
          tripType: trip.type,
          status: kidEntry.status,
          time: kidEntry.time,
          vanId: trip.vanId,
        });
      }
    }

    // Walk every calendar day in the range explicitly, rather than only
    // the days where a trip happened to exist — a day with no trip data
    // at all is a real absence (or at least "not transported"), not a
    // day that should simply disappear from the report.
    const history: any[] = [];
    for (let d = new Date(effectiveStart); d <= end; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0];
      const day = byDate[dateKey];
      if (day) {
        const hasPick = day.trips.some((t: any) => t.tripType === 'pick' && (t.status === 'picked' || t.status === 'dropped'));
        const hasDrop = day.trips.some((t: any) => t.tripType === 'drop' && t.status === 'dropped');
        history.push({
          date: dateKey,
          attendanceStatus: hasPick || hasDrop ? 'present' : 'absent',
          trips: day.trips,
        });
      } else {
        history.push({
          date: dateKey,
          attendanceStatus: 'absent',
          trips: [],
        });
      }
    }
    history.sort((a: any, b: any) => b.date.localeCompare(a.date));

    const totalDays = history.length;
    const presentDays = history.filter((h: any) => h.attendanceStatus === 'present').length;

    return {
      message: 'Student attendance history',
      kid: {
        id: kidId,
        fullname: kid.fullname,
        image: kid.image,
      },
      period: {
        from: start.toISOString().split('T')[0],
        to: end.toISOString().split('T')[0],
      },
      summary: {
        totalDays,
        presentDays,
        absentDays: totalDays - presentDays,
        attendanceRate: totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0,
      },
      history,
    };
  }


}