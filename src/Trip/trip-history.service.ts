/* eslint-disable prettier/prettier */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as moment from 'moment-timezone';
import { Types } from 'mongoose';
import { DatabaseService } from '../database/databaseservice';
import { absenceCovers } from '../Kid/kid-absence.util';
import { isValidPoint, resolveStopPoint } from '../route/stop-point.util';
import {
  KidOutcome, TRIP_ALERT_TYPES, countOutcomes, dayRange, kidOutcome, ownKidIds, parsePaging, parseScope, tripTiming,
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
      distanceMeters: Math.round(trip.distanceMeters || 0),
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
        distanceMeters: Math.round(trip.distanceMeters || 0),
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
