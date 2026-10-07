/* eslint-disable prettier/prettier */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DatabaseService } from 'src/database/databaseservice';
import { EventsGateway } from 'src/events/events.gateway';
import { FirebaseAdminService } from 'src/notification/firebase-admin.service';
import { userRoom } from 'src/chat/chat.util';
import { absenceCovers, isAbsenceTripType, todayIn, validateAbsenceDate } from './kid-absence.util';

const TZ = process.env.DEFAULT_TIMEZONE || 'Asia/Karachi';
const bad = (code: string, message: string) => new BadRequestException({ success: false, code, message });

/**
 * Parents mark a child absent ahead of time. The driver sees it in the
 * passengers list, ETA/geofence pushes skip the child, and the driver is
 * told right away when the absence is for today.
 */
@Injectable()
export class KidAbsenceService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly eventsGateway: EventsGateway,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  private async loadOwnKid(parentId: string, kidId: string) {
    if (!Types.ObjectId.isValid(kidId)) throw new NotFoundException('Student not found');
    const kid: any = await this.databaseService.repositories.KidModel.findById(
      kidId, { parentId: 1, VanId: 1, schoolId: 1, fullname: 1 },
    ).lean();
    if (!kid) throw new NotFoundException('Student not found');
    if (kid.parentId?.toString() !== parentId) throw new ForbiddenException('Not your child');
    return kid;
  }

  async create(parentId: string, body: { kidId: string; date: string; tripType?: string; note?: string }) {
    const kid = await this.loadOwnKid(parentId, body?.kidId);
    const dateError = validateAbsenceDate(body?.date, TZ);
    if (dateError) throw bad('INVALID_DATE', dateError);
    const tripType = body?.tripType ?? 'both';
    if (!isAbsenceTripType(tripType)) throw bad('INVALID_TRIP_TYPE', 'tripType must be pick, drop or both');
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 300) : undefined;

    // One absence per kid per day — marking again updates it.
    const doc: any = await this.databaseService.repositories.kidAbsenceModel.findOneAndUpdate(
      { kidId: kid._id.toString(), date: body.date },
      {
        $set: {
          parentId,
          vanId: kid.VanId,
          schoolId: kid.schoolId,
          tripType,
          ...(note ? { note } : { note: undefined }),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    if (body.date === todayIn(TZ)) await this.notifyDriver(kid, doc, 'kidAbsence');
    return { success: true, message: 'Absence saved. The driver will skip this stop.', data: this.view(doc) };
  }

  async cancel(parentId: string, absenceId: string) {
    if (!Types.ObjectId.isValid(absenceId)) throw new NotFoundException('Absence not found');
    const doc: any = await this.databaseService.repositories.kidAbsenceModel.findById(absenceId).lean();
    if (!doc || doc.parentId !== parentId) throw new NotFoundException('Absence not found');
    await this.databaseService.repositories.kidAbsenceModel.deleteOne({ _id: doc._id });
    if (doc.date === todayIn(TZ)) {
      const kid: any = await this.databaseService.repositories.KidModel.findById(doc.kidId, { VanId: 1, fullname: 1 }).lean();
      if (kid) await this.notifyDriver(kid, doc, 'kidAbsenceCancelled');
    }
    return { success: true, message: 'Absence cancelled' };
  }

  /** Parent: upcoming absences (today onwards) for their kids. */
  async listForParent(parentId: string, kidId?: string) {
    const filter: any = { parentId, date: { $gte: todayIn(TZ) } };
    if (kidId) filter.kidId = kidId;
    const docs: any[] = await this.databaseService.repositories.kidAbsenceModel.find(filter).sort({ date: 1 }).limit(100).lean();
    return { success: true, data: docs.map((d) => this.view(d)) };
  }

  /** Driver: today's absences for kids on their van. */
  async todayForDriver(driverId: string) {
    const van: any = await this.databaseService.repositories.VanModel.findOne(
      { driverId: new Types.ObjectId(driverId) }, { _id: 1 },
    ).lean();
    if (!van) return { success: true, data: [] };
    const docs: any[] = await this.databaseService.repositories.kidAbsenceModel
      .find({ vanId: van._id.toString(), date: todayIn(TZ) }).lean();
    return { success: true, data: docs.map((d) => this.view(d)) };
  }

  /** kidIds absent today for a trip of [tripType] — used by trips/passengers. */
  async absentKidIdsToday(kidIds: string[], tripType: string): Promise<Set<string>> {
    if (!kidIds.length) return new Set();
    const docs: any[] = await this.databaseService.repositories.kidAbsenceModel
      .find({ kidId: { $in: kidIds }, date: todayIn(TZ) }, { kidId: 1, tripType: 1 }).lean();
    return new Set(docs.filter((d) => absenceCovers(d.tripType, tripType)).map((d) => d.kidId));
  }

  private view(d: any) {
    return {
      absenceId: d._id.toString(),
      kidId: d.kidId,
      date: d.date,
      tripType: d.tripType,
      note: d.note || null,
      createdAt: d.createdAt,
    };
  }

  private async notifyDriver(kid: any, absence: any, event: 'kidAbsence' | 'kidAbsenceCancelled') {
    try {
      if (!kid.VanId || !Types.ObjectId.isValid(kid.VanId)) return;
      const van: any = await this.databaseService.repositories.VanModel.findById(kid.VanId, { driverId: 1 }).lean();
      if (!van?.driverId) return;
      const driverId = van.driverId.toString();
      const which = absence.tripType === 'both' ? 'today' : `for today's ${absence.tripType} trip`;
      this.eventsGateway.emitToRoom(userRoom(driverId), event, {
        kidId: kid._id.toString(), fullname: kid.fullname, date: absence.date, tripType: absence.tripType,
      });
      const driver: any = await this.databaseService.repositories.driverModel.findById(driverId, { fcmToken: 1 }).lean();
      if (driver?.fcmToken) {
        await this.firebaseAdminService.sendToDevice(driver.fcmToken, {
          notification: event === 'kidAbsence'
            ? { title: 'Student absent', body: `${kid.fullname} will not ride ${which}.${absence.note ? ` Note: ${absence.note}` : ''}` }
            : { title: 'Absence cancelled', body: `${kid.fullname} will ride today after all.` },
          data: { type: event === 'kidAbsence' ? 'KID_ABSENT' : 'KID_ABSENCE_CANCELLED', kidId: kid._id.toString() },
        });
      }
    } catch (e) {
      console.error('[absence] driver notify failed:', e);
    }
  }
}
