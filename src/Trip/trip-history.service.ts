/* eslint-disable prettier/prettier */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as moment from 'moment-timezone';
import { Types } from 'mongoose';
import { DatabaseService } from '../database/databaseservice';
import { absenceCovers } from '../Kid/kid-absence.util';
import { liveTripStatus } from './tracking-health.util';
import { isValidPoint, resolveStopPoint } from '../route/stop-point.util';
import {
  KidOutcome, TRIP_ALERT_TYPES, countOutcomes, dateRange, dayRange, kidOutcome, ownKidIds, parsePaging, parseScope, tripTiming,
} from './trip-history.util';

const TZ = process.env.DEFAULT_TIMEZONE || 'Asia/Karachi';

const iso = (d: any) => (d ? new Date(d).toISOString() : null);

/**
 * Completed-trip history for drivers (their own trips) and parents (trips
 * that carried their children — only their children's events are exposed).
 */
@Injectable()
export class TripHistoryService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get repos() { return this.databaseService.repositories; }

  private bad(code: string, message: string) {
    return new NotFoundException({ success: false, code, message });
  }

  // ─── Driver ─────────────────────────────────────────────────────────

  private async driverFilter(driverId: string) {
    const van: any = await this.repos.VanModel.findOne({ driverId: new Types.ObjectId(driverId) }, { _id: 1 }).lean();
    // Trips saved before driverId was stored are matched through the driver's current van.
    const or: any[] = [{ driverId }];
    if (van) or.push({ vanId: van._id.toString(), driverId: { $exists: false } });
    return { status: 'end', $or: or };
  }

  async driverCompleted(driverId: string, q: { scope?: string; page?: any; limit?: any }, now = new Date()) {
    const { page, limit, skip } = parsePaging(q.page, q.limit);
    const filter: any = await this.driverFilter(driverId);
    if (parseScope(q.scope) === 'today') {
      const { from, to } = dayRange(TZ, now);
      filter['tripEnd.endTime'] = { $gte: from, $lt: to };
    }
    const [trips, total]: any[] = await Promise.all([
      this.repos.TripModel.find(filter, { locations: 0 }).sort({ 'tripEnd.endTime': -1, _id: -1 }).skip(skip).limit(limit).lean(),
      this.repos.TripModel.countDocuments(filter),
    ]);
    const items = await this.summaries(trips);
    return { success: true, data: { items, total, page, limit, hasMore: skip + trips.length < total } };
  }

  async driverDetails(driverId: string, tripId: string) {
    const trip = await this.loadTrip(tripId);
    const mine = await this.repos.TripModel.countDocuments({ _id: trip._id, ...(await this.driverFilter(driverId)) });
    if (!mine) throw new ForbiddenException({ success: false, code: 'TRIP_NOT_YOURS', message: 'This trip does not belong to you' });

    const ctx = await this.context(trip);
    const [summary] = await this.summaries([trip], ctx);

    // One stop per place; kids sharing a point are listed together.
    const stops: any[] = [];
    const byPlace = new Map<string, any>();
    for (const id of ctx.order) {
      const kid = ctx.kidById.get(id);
      const kl = ctx.locationByKid.get(id);
      const pt = resolveStopPoint(kl, kid);
      const outcome = kidOutcome(id, trip, ctx.absent);
      const key = pt ? `${pt.lat.toFixed(5)},${pt.lng.toFixed(5)}` : `kid:${id}`;
      let stop = byPlace.get(key);
      if (!stop) {
        stop = { order: stops.length + 1, placeName: kl?.address || kid?.homeAddress || `Stop ${stops.length + 1}`, lat: pt?.lat ?? null, lng: pt?.lng ?? null, students: [] };
        byPlace.set(key, stop);
        stops.push(stop);
      }
      stop.students.push({ kidId: id, name: kid?.fullname || 'Student', status: outcome.status, at: outcome.at });
    }

    return {
      success: true,
      data: {
        ...summary,
        stops,
        alerts: await this.alerts(trip),
        school: ctx.school,
      },
    };
  }


  // ─── Admin (school-scoped) ──────────────────────────────────────────

  /**
   * The school the caller may see: admin → their school, school_staff →
   * their school, superadmin → ?schoolId= (required).
   */
  async adminSchoolId(user: any, schoolIdParam?: string): Promise<string> {
    if (user?.role === 'superadmin') {
      if (!schoolIdParam || !Types.ObjectId.isValid(schoolIdParam)) {
        throw new BadRequestException({ success: false, code: 'SCHOOL_ID_REQUIRED', message: 'schoolId is required' });
      }
      return schoolIdParam;
    }
    if (user?.role === 'admin') {
      const school: any = await this.repos.SchoolModel.findOne({ admin: new Types.ObjectId(user.userId) }, { _id: 1 }).lean();
      if (school?._id) return school._id.toString();
    } else if (user?.role === 'school_staff' && user.schoolId) {
      return user.schoolId.toString();
    }
    throw new ForbiddenException({ success: false, code: 'NOT_SCHOOL_ADMIN', message: 'Only school admins can view this' });
  }

  /** Ongoing trips of the school with the last location and a live status. */
  async adminActive(user: any, schoolIdParam?: string, now = new Date()) {
    const schoolId = await this.adminSchoolId(user, schoolIdParam);
    const trips: any[] = await this.repos.TripModel.find(
      { schoolId, status: 'ongoing' },
      { locations: { $slice: -1 }, vanId: 1, routeId: 1, type: 1, driverId: 1, kids: 1, startedAt: 1, tripStart: 1, createdAt: 1, lastLocationAt: 1, stoppedSince: 1, trafficAlertAt: 1 },
    ).sort({ createdAt: -1 }).limit(200).lean();

    const ids = (key: string) => [...new Set(trips.map((t) => t[key]).filter((v) => v && Types.ObjectId.isValid(v.toString())).map(String))];
    const [vans, routes]: any[] = await Promise.all([
      this.repos.VanModel.find({ _id: { $in: ids('vanId') } }, { carNumber: 1, driverId: 1 }).lean(),
      this.repos.routeModel.find({ _id: { $in: ids('routeId') } }, { title: 1 }).lean(),
    ]);
    const vanById = new Map<string, any>(vans.map((v: any) => [v._id.toString(), v]));
    const routeById = new Map<string, any>(routes.map((r: any) => [r._id.toString(), r]));
    const driverIds = [...new Set(trips.map((t) => (t.driverId || vanById.get(t.vanId)?.driverId)?.toString()).filter((v) => v && Types.ObjectId.isValid(v)))];
    const drivers: any[] = driverIds.length ? await this.repos.driverModel.find({ _id: { $in: driverIds } }, { fullname: 1 }).lean() : [];
    const driverById = new Map<string, any>(drivers.map((d: any) => [d._id.toString(), d]));

    const items = trips.map((t) => {
      const loc = t.locations?.[t.locations.length - 1];
      const lastFixAt = t.lastLocationAt || loc?.time || null;
      const driverRef = (t.driverId || vanById.get(t.vanId)?.driverId)?.toString();
      return {
        tripId: t._id.toString(),
        driverName: driverById.get(driverRef)?.fullname || null,
        vanNumber: vanById.get(t.vanId)?.carNumber || null,
        routeName: routeById.get(t.routeId)?.title || null,
        tripType: t.type,
        startedAt: iso(tripTiming(t).startedAt),
        lastLocation: loc ? { lat: loc.lat, lng: loc.long, heading: null, speed: null, t: iso(loc.time || lastFixAt) } : null,
        status: liveTripStatus({ lastFixAt, accuracy: loc?.accuracy, stoppedSince: t.stoppedSince, trafficAlertAt: t.trafficAlertAt }, now),
        studentsOnBoard: (t.kids || []).filter((k: any) => k.status === 'picked').length,
      };
    });
    return { success: true, data: { items, total: items.length } };
  }

  /** Paginated finished trips of the school; from/to are PKT calendar days (inclusive). */
  async adminCompleted(
    user: any,
    q: { schoolId?: string; from?: string; to?: string; driverId?: string; vanId?: string; routeId?: string; tripType?: string; page?: any; limit?: any },
  ) {
    const schoolId = await this.adminSchoolId(user, q.schoolId);
    const { page, limit, skip } = parsePaging(q.page, q.limit);
    const filter: any = { schoolId, status: 'end' };
    const range = dateRange(TZ, q.from, q.to);
    if (!range) throw new BadRequestException({ success: false, code: 'INVALID_DATE', message: 'from/to must be YYYY-MM-DD' });
    if (range.$gte || range.$lt) filter['tripEnd.endTime'] = range;
    if (q.tripType) {
      if (q.tripType !== 'pick' && q.tripType !== 'drop') throw new BadRequestException({ success: false, code: 'INVALID_TRIP_TYPE', message: 'tripType must be pick or drop' });
      filter.type = q.tripType;
    }
    if (q.vanId) filter.vanId = String(q.vanId);
    if (q.routeId) filter.routeId = String(q.routeId);
    if (q.driverId) {
      const vans: any[] = Types.ObjectId.isValid(q.driverId)
        ? await this.repos.VanModel.find({ driverId: new Types.ObjectId(q.driverId), schoolId }, { _id: 1 }).lean()
        : [];
      // Trips saved before driverId was stored are matched through the driver's van.
      filter.$or = [{ driverId: String(q.driverId) }, ...(vans.length ? [{ vanId: { $in: vans.map((v) => v._id.toString()) }, driverId: { $exists: false } }] : [])];
    }
    const [trips, total]: any[] = await Promise.all([
      this.repos.TripModel.find(filter, { locations: 0 }).sort({ 'tripEnd.endTime': -1, _id: -1 }).skip(skip).limit(limit).lean(),
      this.repos.TripModel.countDocuments(filter),
    ]);
    const items = await Promise.all(trips.map(async (t) => {
      const ctx = await this.context(t);
      const [summary] = await this.summaries([t], ctx);
      return { ...summary, driverName: ctx.driver?.fullname || null, vanNumber: ctx.van?.carNumber || null };
    }));
    return { success: true, data: { items, total, page, limit, hasMore: skip + trips.length < total } };
  }

  /** Everything about one trip of the school: all students, stops, alerts, distance, duration. */
  async adminDetails(user: any, tripId: string, schoolIdParam?: string) {
    const schoolId = await this.adminSchoolId(user, schoolIdParam);
    const trip = await this.loadTrip(tripId);
    if (trip.schoolId !== schoolId) throw new ForbiddenException({ success: false, code: 'TRIP_NOT_YOURS', message: 'This trip belongs to another school' });
    const ctx = await this.context(trip);
    const [summary] = await this.summaries([trip], ctx);
    const waits = new Map<string, any>((trip.stopWaits || []).map((w: any) => [w.kidId, w]));

    const students = ctx.order.map((id: string) => {
      const kid = ctx.kidById.get(id);
      const o = kidOutcome(id, trip, ctx.absent);
      return { kidId: id, name: kid?.fullname || 'Student', status: o.status, at: o.at, arrivedAtStopAt: iso(waits.get(id)?.at) };
    });
    const stops: any[] = [];
    const byPlace = new Map<string, any>();
    for (const id of ctx.order) {
      const kid = ctx.kidById.get(id);
      const kl = ctx.locationByKid.get(id);
      const pt = resolveStopPoint(kl, kid);
      const key = pt ? `${pt.lat.toFixed(5)},${pt.lng.toFixed(5)}` : `kid:${id}`;
      let stop = byPlace.get(key);
      if (!stop) {
        stop = { order: stops.length + 1, placeName: kl?.address || kid?.homeAddress || `Stop ${stops.length + 1}`, lat: pt?.lat ?? null, lng: pt?.lng ?? null, students: [] };
        byPlace.set(key, stop);
        stops.push(stop);
      }
      const o = kidOutcome(id, trip, ctx.absent);
      stop.students.push({ kidId: id, name: kid?.fullname || 'Student', status: o.status, at: o.at });
    }
    return {
      success: true,
      data: {
        ...summary,
        driverName: ctx.driver?.fullname || null,
        vanNumber: ctx.van?.carNumber || null,
        maxSpeedKmh: trip.maxSpeedKmh || 0,
        students,
        stops,
        alerts: await this.alerts(trip),
        school: ctx.school,
      },
    };
  }

  // ─── Parent ─────────────────────────────────────────────────────────

  private async parentKids(parentId: string) {
    return this.repos.KidModel.find({ parentId: new Types.ObjectId(parentId) }, { fullname: 1, parentId: 1 }).lean() as Promise<any[]>;
  }

  /** Trips (finished) that carried at least one of [kidIds]. */
  private async parentFilter(kidIds: string[]) {
    const routes: any[] = await this.repos.routeModel
      .find({ 'kidLocations.kidId': { $in: kidIds.map((id) => new Types.ObjectId(id)) } }, { _id: 1 }).lean();
    const routeIds = routes.map((r) => r._id.toString());
    return { status: 'end', $or: [{ 'kids.kidId': { $in: kidIds } }, { routeId: { $in: routeIds } }] };
  }

  async parentCompleted(parentId: string, q: { scope?: string; page?: any; limit?: any }, now = new Date()) {
    const { page, limit, skip } = parsePaging(q.page, q.limit);
    const kids = await this.parentKids(parentId);
    if (!kids.length) return { success: true, data: { items: [], total: 0, page, limit, hasMore: false } };
    const filter: any = await this.parentFilter(kids.map((k) => k._id.toString()));
    if (parseScope(q.scope) === 'today') {
      const { from, to } = dayRange(TZ, now);
      filter['tripEnd.endTime'] = { $gte: from, $lt: to };
    }
    const [trips, total]: any[] = await Promise.all([
      this.repos.TripModel.find(filter, { locations: 0 }).sort({ 'tripEnd.endTime': -1, _id: -1 }).skip(skip).limit(limit).lean(),
      this.repos.TripModel.countDocuments(filter),
    ]);
    const items = await Promise.all(trips.map(async (t) => {
      const ctx = await this.context(t);
      return this.parentView(t, ctx, ownKidIds(kids, parentId), false);
    }));
    return { success: true, data: { items, total, page, limit, hasMore: skip + trips.length < total } };
  }

  async parentDetails(parentId: string, tripId: string) {
    const trip = await this.loadTrip(tripId);
    const kids = await this.parentKids(parentId);
    const mine = ownKidIds(kids, parentId);
    const allowed = kids.length
      ? await this.repos.TripModel.countDocuments({ _id: trip._id, ...(await this.parentFilter([...mine])) })
      : 0;
    if (!allowed || trip.status !== 'end') {
      throw new ForbiddenException({ success: false, code: 'TRIP_NOT_YOURS', message: 'This trip did not include your child' });
    }
    const ctx = await this.context(trip);
    return { success: true, data: await this.parentView(trip, ctx, mine, true) };
  }

  /**
   * Privacy: only the parent's own children appear (names, status, times);
   * no other children, no stop addresses, no school-wide counts.
   */
  private async parentView(trip: any, ctx: any, mine: Set<string>, full: boolean) {
    const t = tripTiming(trip);
    const children = ctx.order.filter((id: string) => mine.has(id)).map((id: string) => {
      const o: KidOutcome = kidOutcome(id, trip, ctx.absent);
      return { kidId: id, name: ctx.kidById.get(id)?.fullname || 'Student', status: o.status, at: o.at };
    });
    // Kids on the trip but no longer on the route still count.
    for (const k of trip.kids || []) {
      const id = k.kidId?.toString();
      if (mine.has(id) && !children.some((c: any) => c.kidId === id)) {
        children.push({ kidId: id, name: ctx.kidById.get(id)?.fullname || 'Student', status: k.status, at: iso(k.time) });
      }
    }
    const view: any = {
      id: trip._id.toString(),
      routeName: ctx.route?.title || null,
      tripType: trip.type,
      date: moment(t.endedAt || t.startedAt).tz(TZ).format('YYYY-MM-DD'),
      startedAt: iso(t.startedAt),
      endedAt: iso(t.endedAt),
      durationSeconds: t.durationSeconds,
      distanceMeters: Math.round(trip.distanceMetersCleaned ?? trip.distanceMeters ?? 0),
      children,
    };
    if (full) {
      view.driverName = ctx.driver?.fullname || null;
      view.vanNumber = ctx.van?.carNumber || null;
      view.school = ctx.school;
    }
    return view;
  }

  // ─── Shared ─────────────────────────────────────────────────────────

  private async loadTrip(tripId: string): Promise<any> {
    if (!Types.ObjectId.isValid(tripId)) throw this.bad('TRIP_NOT_FOUND', 'Trip not found');
    const trip = await this.repos.TripModel.findById(tripId, { locations: 0 }).lean();
    if (!trip) throw this.bad('TRIP_NOT_FOUND', 'Trip not found');
    return trip;
  }

  /** Route, kids, absences, school, van and driver for one trip. */
  private async context(trip: any) {
    const repos = this.repos;
    const route: any = Types.ObjectId.isValid(trip.routeId)
      ? await repos.routeModel.findById(trip.routeId, { title: 1, kidLocations: 1 }).lean()
      : null;
    const locationByKid = new Map<string, any>();
    for (const kl of route?.kidLocations || []) if (kl?.kidId) locationByKid.set(kl.kidId.toString(), kl);

    const stopOrder: string[] = (trip.routeOptimization?.stopOrder || []).map(String);
    const routeIds = [...locationByKid.keys()];
    const order = [
      ...stopOrder.filter((id) => routeIds.includes(id)),
      ...routeIds.filter((id) => !stopOrder.includes(id)),
    ];
    for (const k of trip.kids || []) {
      const id = k.kidId?.toString();
      if (id && !order.includes(id)) order.push(id);
    }

    const [kids, van, school]: any[] = await Promise.all([
      repos.KidModel.find({ _id: { $in: order.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id)) } }, { fullname: 1, homeAddress: 1, homeLat: 1, homeLng: 1, parentId: 1 }).lean(),
      Types.ObjectId.isValid(trip.vanId) ? repos.VanModel.findById(trip.vanId, { carNumber: 1, driverId: 1 }).lean() : null,
      Types.ObjectId.isValid(trip.schoolId) ? repos.SchoolModel.findById(trip.schoolId, { schoolName: 1, lat: 1, long: 1 }).lean() : null,
    ]);
    const driverRef = trip.driverId || (van as any)?.driverId;
    const driver: any = driverRef && Types.ObjectId.isValid(driverRef.toString())
      ? await repos.driverModel.findById(driverRef, { fullname: 1 }).lean()
      : null;

    const date = moment(trip.startedAt || trip.tripStart?.startTime || trip.createdAt).tz(TZ).format('YYYY-MM-DD');
    const absences: any[] = order.length
      ? await repos.kidAbsenceModel.find({ kidId: { $in: order }, date }, { kidId: 1, tripType: 1 }).lean()
      : [];
    const absent = new Set<string>(absences.filter((a) => absenceCovers(a.tripType, trip.type)).map((a) => a.kidId));

    return {
      route, order, locationByKid, van, driver, absent,
      kidById: new Map<string, any>(kids.map((k: any) => [k._id.toString(), k])),
      school: school && isValidPoint(school.lat, school.long)
        ? { name: school.schoolName || 'School', lat: school.lat, lng: school.long }
        : null,
    };
  }

  /** List-row summaries (driver view: counts across the whole trip). */
  private async summaries(trips: any[], only?: any) {
    return Promise.all(trips.map(async (trip) => {
      const ctx = only || await this.context(trip);
      const t = tripTiming(trip);
      const outcomes = ctx.order.map((id: string) => kidOutcome(id, trip, ctx.absent));
      return {
        id: trip._id.toString(),
        routeName: ctx.route?.title || null,
        tripType: trip.type,
        date: moment(t.endedAt || t.startedAt).tz(TZ).format('YYYY-MM-DD'),
        startedAt: iso(t.startedAt),
        endedAt: iso(t.endedAt),
        durationSeconds: t.durationSeconds,
        distanceMeters: Math.round(trip.distanceMetersCleaned ?? trip.distanceMeters ?? 0),
        studentCount: ctx.order.length,
        ...countOutcomes(outcomes),
      };
    }));
  }

  /** SOS, overspeed, traffic delay and tracking-lost alerts raised for the van during the trip. */
  private async alerts(trip: any) {
    const t = tripTiming(trip);
    if (!t.startedAt || !t.endedAt) return [];
    const rows: any[] = await this.repos.notificationModel.find(
      { VanId: trip.vanId, alertType: { $in: TRIP_ALERT_TYPES }, date: { $gte: new Date(t.startedAt), $lte: new Date(t.endedAt) } },
      { alertType: 1, title: 1, message: 1, date: 1 },
    ).sort({ date: 1 }).lean();
    const kind: Record<string, string> = { DRIVER_SOS: 'sos', OVERSPEED: 'overspeed', TRAFFIC_DELAY: 'traffic_delay', TRACKING_LOST: 'tracking_lost' };
    return rows.map((r) => ({ type: kind[r.alertType] || r.alertType, title: r.title || null, message: r.message || null, at: iso(r.date) }));
  }
}
