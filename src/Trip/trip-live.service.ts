/* eslint-disable prettier/prettier */
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Types } from 'mongoose';
import { DatabaseService } from 'src/database/databaseservice';
import { EventsGateway } from 'src/events/events.gateway';
import { FirebaseAdminService } from 'src/notification/firebase-admin.service';
import { absenceCovers, todayIn } from 'src/Kid/kid-absence.util';
import { EtaService } from './eta.service';
import { GeofenceService } from './geofence.service';
import { downsample, encodePolyline } from './polyline.util';
import { simplifyTrail, toTrailPoints } from './trip-history.util';
import { isValidPoint, resolveStopPoint } from 'src/route/stop-point.util';
import { stopStateOf } from './optimize-route.util';
import { isMoving, nextTrafficState } from './traffic-delay.util';
import { cleanBackfill, trackingLostMinutes } from './tracking-health.util';
import { evaluatePoint, GeoSample, PendingJump, readTrackingMeta, sessionAllows, TRACKING_SESSION_REPLACED } from './location-guard.util';

const TZ = process.env.DEFAULT_TIMEZONE || 'Asia/Karachi';
const PLAN_CACHE_MS = 90_000;

type StopStatus = 'waiting' | 'picked' | 'dropped' | 'absent' | 'no_show';

/**
 * Live-trip data for the maps: the planned route through the stops, the
 * trail the van actually drove, and traffic-delay alerts.
 */
@Injectable()
export class TripLiveService {
  /** tripId → cached plan (Directions is billed per call). */
  private planCache = new Map<string, { at: number; key: string; plan: any }>();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly etaService: EtaService,
    private readonly geofenceService: GeofenceService,
    private readonly eventsGateway: EventsGateway,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  // ─── Access ─────────────────────────────────────────────────────────

  /** Driver of the van, a parent of a kid on the trip, or the school's admin/staff. */
  private async loadViewableTrip(user: any, tripId: string) {
    if (!Types.ObjectId.isValid(tripId)) throw new NotFoundException('Trip not found');
    const repos = this.databaseService.repositories;
    const trip: any = await repos.TripModel.findById(tripId).lean();
    if (!trip) throw new NotFoundException('Trip not found');
    const route: any = Types.ObjectId.isValid(trip.routeId)
      ? await repos.routeModel.findById(trip.routeId, { kidLocations: 1, title: 1, routeTitle: 1 }).lean()
      : null;
    const userId = user?.userId;

    let allowed = false;
    if (user?.userType === 'driver') {
      const van: any = await repos.VanModel.findOne({ driverId: new Types.ObjectId(userId) }, { _id: 1 }).lean();
      allowed = !!van && van._id.toString() === trip.vanId;
    } else if (user?.userType === 'parent') {
      const kids: any[] = await repos.KidModel.find({ parentId: new Types.ObjectId(userId) }, { _id: 1, VanId: 1 }).lean();
      const ids = new Set(kids.map((k) => k._id.toString()));
      // A finished trip is only visible to parents whose child was on it;
      // for live trips the van match is enough (so a late joiner can watch).
      allowed = (trip.status !== 'end' && kids.some((k) => k.VanId === trip.vanId))
        || (trip.kids || []).some((k: any) => ids.has(k.kidId?.toString()))
        || (route?.kidLocations || []).some((kl: any) => ids.has(kl.kidId?.toString()));
    } else if (user?.role === 'superadmin') {
      allowed = true;
    } else if (user?.role === 'admin') {
      const school: any = await repos.SchoolModel.findOne({ admin: new Types.ObjectId(userId) }, { _id: 1 }).lean();
      allowed = school?._id?.toString() === trip.schoolId;
    } else if (user?.role === 'school_staff') {
      allowed = user.schoolId?.toString() === trip.schoolId;
    }
    if (!allowed) throw new ForbiddenException('You cannot view this trip');
    return { trip, route };
  }

  // ─── Route plan ─────────────────────────────────────────────────────

  /**
   * Stops in visiting order (optimized order if the driver optimized the
   * route, otherwise the route's order) with each kid's status, plus a
   * road-following polyline from the van's latest position through the
   * stops still to visit to the destination.
   *
   * Parents only see their own children's names; other stops are shown as
   * "Stop N" without names.
   */
  async routePlan(user: any, tripId: string) {
    const { trip, route } = await this.loadViewableTrip(user, tripId);
    const repos = this.databaseService.repositories;
    const kidLocations: any[] = (route?.kidLocations || []).filter((kl: any) => kl?.kidId);
    const kidIds = kidLocations.map((kl) => kl.kidId.toString());

    // Visiting order
    const order: string[] = trip.routeOptimization?.stopOrder?.length
      ? [...trip.routeOptimization.stopOrder.map(String), ...kidIds.filter((id) => !trip.routeOptimization.stopOrder.map(String).includes(id))]
      : kidIds;

    const [kids, absences, school]: any[] = await Promise.all([
      repos.KidModel.find({ _id: { $in: kidIds.map((id) => new Types.ObjectId(id)) } }, { fullname: 1, image: 1, parentId: 1, homeLat: 1, homeLng: 1 }).lean(),
      repos.kidAbsenceModel.find({ kidId: { $in: kidIds }, date: todayIn(TZ) }, { kidId: 1, tripType: 1 }).lean(),
      Types.ObjectId.isValid(trip.schoolId) ? repos.SchoolModel.findById(trip.schoolId, { schoolName: 1, lat: 1, long: 1 }).lean() : null,
    ]);
    const kidById = new Map(kids.map((k: any) => [k._id.toString(), k]));
    const absent = new Set<string>(absences.filter((a: any) => absenceCovers(a.tripType, trip.type)).map((a: any) => a.kidId));
    const noShow = new Set<string>((trip.noShows || []).map((n: any) => n.kidId));
    const entries = trip.kids || [];
    const statusOf = (id: string): StopStatus => stopStateOf(entries, id, noShow, absent);

    const parentId = user?.userType === 'parent' ? user.userId : null;
    // Stop point = route stop location, or the child's home if the stop was
    // saved without one. Stops with neither are left off the map.
    const pointById = new Map<string, { lat: number; lng: number }>();
    for (const kl of kidLocations) {
      const pt = resolveStopPoint(kl, kidById.get(kl.kidId.toString()) as any);
      if (pt) pointById.set(kl.kidId.toString(), pt);
    }
    const stops = order
      .filter((id) => pointById.has(id))
      .map((id, i) => {
        const pt = pointById.get(id)!;
        const kid: any = kidById.get(id);
        const mine = !parentId || kid?.parentId?.toString() === parentId;
        return {
          order: i + 1,
          kidId: mine ? id : null,
          fullname: mine ? kid?.fullname || 'Student' : `Stop ${i + 1}`,
          image: mine ? kid?.image || null : null,
          mine,
          lat: pt.lat,
          lng: pt.lng,
          status: statusOf(id),
        };
      });

    const schoolPoint = school && isValidPoint(school.lat, school.long)
      ? { name: school.schoolName || 'School', lat: school.lat, lng: school.long }
      : null;

    // Stops still to visit: pick trip → kids waiting at home, then school.
    // Drop trip → kids still in the van (picked), dropped at home.
    const remaining = stops.filter((s) => (trip.type === 'drop' ? s.status === 'picked' : s.status === 'waiting'));
    const last = trip.locations?.[trip.locations.length - 1];
    const vanPoint = last ? { lat: last.lat, lng: last.long } : null;

    let path: { polyline: string; distanceMeters: number; durationSeconds: number; legs: any[] } | null = null;
    const origin = vanPoint || (trip.type === 'drop' ? schoolPoint : remaining[0]) || null;
    // Pick trip ends at school; if the school has no location saved, the line
    // still goes through the remaining stops and ends at the last one.
    const pickEnd = schoolPoint || remaining[remaining.length - 1] || null;
    const destination = trip.type === 'drop' ? remaining[remaining.length - 1] || null : pickEnd;
    const waypoints = trip.type === 'drop'
      ? remaining.slice(0, -1)
      : schoolPoint ? remaining : remaining.slice(0, -1);

    if (trip.status === 'ongoing' && origin && destination) {
      // Re-plan only when the remaining stops change or every 90 s.
      const key = `${remaining.map((s) => s.order).join(',')}|${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}`;
      const cached = this.planCache.get(tripId);
      if (cached && cached.key.split('|')[0] === key.split('|')[0] && Date.now() - cached.at < PLAN_CACHE_MS) {
        path = cached.plan;
      } else {
        try {
          const r = await this.etaService.getRoutePath(origin, destination, waypoints);
          path = {
            polyline: encodePolyline(r.points),
            distanceMeters: r.legs.reduce((a, l) => a + l.distanceMeters, 0),
            durationSeconds: r.legs.reduce((a, l) => a + l.durationSeconds, 0),
            legs: r.legs,
          };
          this.planCache.set(tripId, { at: Date.now(), key, plan: path });
        } catch {
          path = null; // the app still shows the stops without the line
        }
      }
    }

    return {
      success: true,
      data: {
        tripId,
        type: trip.type,
        status: trip.status,
        van: vanPoint,
        school: schoolPoint,
        stops,
        nextStopOrder: remaining[0]?.order ?? null,
        plannedPath: path,
      },
    };
  }

  // ─── Trail ──────────────────────────────────────────────────────────

  /**
   * The path the van has actually driven on this trip.
   * `polyline`/`points` (≤2000 pts, encoded) feed the live map; `path` is
   * the same trail as [{lat,lng,t}] simplified to ≤1000 points, with
   * `start`/`end` for history screens.
   */
  async trail(user: any, tripId: string) {
    const { trip } = await this.loadViewableTrip(user, tripId);
    const all = toTrailPoints(trip.locations || [], trip.locationsCleaned);
    const pts: [number, number][] = all.map((p) => [p.lat, p.lng]);
    const sampled = downsample(pts, 2000);
    const path = simplifyTrail(all, 1000);
    const startedAt = trip.startedAt || trip.tripStart?.startTime || trip.createdAt;
    return {
      success: true,
      data: {
        tripId,
        polyline: encodePolyline(sampled),
        points: sampled.length,
        path,
        start: all[0] || null,
        end: all[all.length - 1] || null,
        startedAt,
        endedAt: trip.endedAt || trip.tripEnd?.endTime || null,
        lastAt: trip.locations?.[trip.locations.length - 1]?.time || null,
      },
    };
  }

  // ─── Tracking session ───────────────────────────────────────────────

  /**
   * The driver's phone says it tracks this trip now (the driver started or
   * resumed it in the app). Any earlier session is replaced: its next
   * location gets 409 TRACKING_SESSION_REPLACED and that app stops.
   */
  async claimSession(driverId: string, tripId: string, body: { sessionId?: unknown; deviceId?: unknown }) {
    if (!Types.ObjectId.isValid(tripId)) throw new NotFoundException('Trip not found');
    const { sessionId, deviceId } = readTrackingMeta(body);
    if (!sessionId) throw new BadRequestException({ success: false, code: 'SESSION_ID_REQUIRED', message: 'sessionId is required' });
    const repos = this.databaseService.repositories;
    const trip: any = await repos.TripModel.findById(tripId, { vanId: 1, status: 1, trackingSession: 1 }).lean();
    if (!trip) throw new NotFoundException('Trip not found');
    const van: any = await repos.VanModel.findOne({ driverId: new Types.ObjectId(driverId) }, { _id: 1 }).lean();
    if (!van || van._id.toString() !== trip.vanId) throw new ForbiddenException('This trip does not belong to your van');
    if (trip.status !== 'ongoing') {
      throw new BadRequestException({ success: false, code: 'TRIP_NOT_ONGOING', message: 'Trip is not in progress' });
    }
    const previous: string | undefined = trip.trackingSession?.sessionId;
    const replaced = !!previous && previous !== sessionId;
    await repos.TripModel.updateOne(
      { _id: trip._id },
      { $set: { trackingSession: { sessionId, ...(deviceId ? { deviceId } : {}), claimedAt: new Date() }, pendingJump: null } },
    );
    this.eventsGateway.setTrackingSession(tripId, sessionId);
    if (replaced) this.eventsGateway.emitToRoom(tripId, 'trackingSessionReplaced', { tripId, replacedSessionId: previous });
    return { success: true, data: { sessionId, replaced } };
  }

  // ─── Offline backfill ───────────────────────────────────────────────

  /**
   * Points the driver app recorded while it had no internet, sent in one go
   * when it's back online. Merged into the trail in time order so the
   * parent/admin map shows the full path. No ETA/geofence pushes for these
   * (they are in the past). Accepted for the ongoing trip, or up to 30 min
   * after it ended.
   */
  async backfill(driverId: string, tripId: string, body: { points?: unknown; sessionId?: unknown; deviceId?: unknown }) {
    if (!Types.ObjectId.isValid(tripId)) throw new NotFoundException('Trip not found');
    const repos = this.databaseService.repositories;
    const trip: any = await repos.TripModel.findById(tripId, { vanId: 1, status: 1, createdAt: 1, tripStart: 1, tripEnd: 1, trackingSession: 1 }).lean();
    if (!trip) throw new NotFoundException('Trip not found');
    const van: any = await repos.VanModel.findOne({ driverId: new Types.ObjectId(driverId) }, { _id: 1 }).lean();
    if (!van || van._id.toString() !== trip.vanId) throw new ForbiddenException('This trip does not belong to your van');

    const meta = readTrackingMeta(body);
    if (!sessionAllows(trip.trackingSession, meta.sessionId)) {
      throw new ConflictException({ success: false, code: TRACKING_SESSION_REPLACED, message: 'This trip is now tracked from another device' });
    }

    const now = new Date();
    const endedAt = trip.tripEnd?.endTime ? new Date(trip.tripEnd.endTime) : null;
    if (trip.status !== 'ongoing' && !(endedAt && now.getTime() - endedAt.getTime() <= 30 * 60_000)) {
      throw new BadRequestException({ success: false, code: 'TRIP_NOT_ONGOING', message: 'Trip is not in progress' });
    }
    const from = new Date(trip.tripStart?.startTime || trip.createdAt);
    const to = endedAt && endedAt < now ? endedAt : now;
    // Sorted by the phone's own timestamps; then the same quality filters as
    // live points, point by point within the batch.
    const sorted = cleanBackfill(body?.points, { from: new Date(from.getTime() - 60_000), to: new Date(to.getTime() + 60_000) });
    const points: typeof sorted = [];
    let prev: GeoSample | null = null;
    let pending: PendingJump | null = null;
    for (const p of sorted) {
      const v = evaluatePoint({ lat: p.lat, long: p.long, time: p.time, accuracy: p.accuracy }, prev, new Date(to.getTime() + 60_000), pending);
      pending = v.pending;
      if (!v.accept) continue;
      points.push(p);
      prev = p;
    }
    if (!points.length) return { success: true, data: { accepted: 0 } };

    const lastTime = points[points.length - 1].time;
    await repos.TripModel.updateOne(
      { _id: trip._id },
      {
        $push: {
          locations: {
            $each: points.map((p) => ({
              lat: p.lat, long: p.long, time: p.time,
              ...(meta.deviceId ? { deviceId: meta.deviceId } : {}),
              ...(meta.sessionId ? { sessionId: meta.sessionId } : {}),
              ...(p.accuracy !== undefined ? { accuracy: p.accuracy } : {}),
            })),
            $sort: { time: 1 },
          },
        },
        $max: { lastLocationAt: lastTime },
      },
    );
    this.eventsGateway.emitToRoom(tripId, 'trailBackfilled', { tripId, points: points.length, at: now.toISOString() });
    return { success: true, data: { accepted: points.length } };
  }

  // ─── Tracking lost ──────────────────────────────────────────────────

  /**
   * Every minute: ongoing trips (started in the last 12 h) with no location
   * for TRACKING_LOST_MINUTES (default 4) → one ADMIN alert, socket
   * 'trackingLostAlert' on the school room and tripStatus 'offline' for
   * parents. Cleared automatically when locations resume.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkTrackingLost(now: Date = new Date()) {
    const repos = this.databaseService.repositories;
    const cutoff = new Date(now.getTime() - trackingLostMinutes() * 60_000);
    const since = new Date(now.getTime() - 12 * 60 * 60_000);
    const trips: any[] = await repos.TripModel.find(
      {
        status: 'ongoing',
        createdAt: { $gte: since, $lt: cutoff },
        $and: [
          { $or: [{ trackingLostAt: null }, { trackingLostAt: { $exists: false } }] },
          { $or: [{ lastLocationAt: { $lt: cutoff } }, { lastLocationAt: { $exists: false } }, { lastLocationAt: null }] },
        ],
      },
      { vanId: 1, schoolId: 1, lastLocationAt: 1, createdAt: 1 },
    ).limit(200).lean();

    for (const trip of trips) {
      try {
        // Claim it first so two instances / overlapping runs alert once.
        const claimed = await repos.TripModel.updateOne(
          { _id: trip._id, $or: [{ trackingLostAt: null }, { trackingLostAt: { $exists: false } }] },
          { $set: { trackingLostAt: now } },
        );
        if (!claimed.modifiedCount) continue;

        const lastSeen = trip.lastLocationAt || trip.createdAt;
        const minutes = Math.max(1, Math.round((now.getTime() - new Date(lastSeen).getTime()) / 60_000));
        const van: any = Types.ObjectId.isValid(trip.vanId)
          ? await repos.VanModel.findById(trip.vanId, { carNumber: 1, driverId: 1 }).lean()
          : null;
        const driver: any = van?.driverId ? await repos.driverModel.findById(van.driverId, { fullname: 1, phoneNo: 1 }).lean() : null;
        const driverName = driver?.fullname || 'Driver';

        const alert = await repos.notificationModel.create({
          type: 'tracking_lost', alertType: 'TRACKING_LOST', recipientType: 'ADMIN', infoType: 'Warning',
          driverId: van?.driverId?.toString(), schoolId: trip.schoolId, VanId: trip.vanId,
          title: 'Live tracking lost',
          message: `No location from ${driverName}${van?.carNumber ? ` (van ${van.carNumber})` : ''} for ${minutes} min during a trip.` +
            `${driver?.phoneNo ? ` Call: ${driver.phoneNo}` : ''}`,
          status: 'sent', date: now,
        });
        this.eventsGateway.emitToSchool(trip.schoolId, 'trackingLostAlert', {
          alertId: alert._id.toString(), tripId: trip._id.toString(), driverName,
          driverPhone: driver?.phoneNo || '', vanNumber: van?.carNumber || '',
          lastSeenAt: new Date(lastSeen).toISOString(), minutes, at: now.toISOString(),
        });
        this.eventsGateway.emitToRoom(trip._id.toString(), 'tripStatus', {
          tripId: trip._id.toString(), status: 'offline', lastSeenAt: new Date(lastSeen).toISOString(), at: now.toISOString(),
        });
      } catch (e) {
        console.error('[tracking-lost] failed for trip', trip._id?.toString(), e);
      }
    }
  }

  // ─── Traffic delay ──────────────────────────────────────────────────

  /**
   * Called on every stored location (POST /trips/updateLocation). If the
   * van stands still for TRAFFIC_STOP_SECONDS (default 120) away from any
   * stop and the school, the school admin and the parents of kids still
   * waiting / in the van are alerted (max once per 10 min per trip).
   */
  async checkTraffic(trip: any, lat: number, lng: number, speedKmh: number | null, segmentMeters: number | null) {
    const now = new Date();
    const moving = isMoving(speedKmh, segmentMeters);
    const repos = this.databaseService.repositories;

    let nearStop = false;
    if (!moving) {
      const route: any = Types.ObjectId.isValid(trip.routeId)
        ? await repos.routeModel.findById(trip.routeId, { kidLocations: 1 }).lean()
        : null;
      const stopKids: any[] = (route?.kidLocations || []).length
        ? await repos.KidModel.find(
            { _id: { $in: route.kidLocations.map((kl: any) => kl.kidId) } },
            { homeLat: 1, homeLng: 1 },
          ).lean()
        : [];
      const homeById = new Map(stopKids.map((k: any) => [k._id.toString(), k]));
      nearStop = (route?.kidLocations || []).some((kl: any) => {
        const pt = resolveStopPoint(kl, homeById.get(kl.kidId?.toString()) as any);
        return !!pt && this.geofenceService.getDistanceMeters(lat, lng, pt.lat, pt.lng) <= 150;
      });
      if (!nearStop && Types.ObjectId.isValid(trip.schoolId)) {
        const school: any = await repos.SchoolModel.findById(trip.schoolId, { lat: 1, long: 1 }).lean();
        if (school && isValidPoint(school.lat, school.long)) {
          nearStop = this.geofenceService.getDistanceMeters(lat, lng, school.lat, school.long) <= 250;
        }
      }
    }

    const next = nextTrafficState(
      { stoppedSince: trip.stoppedSince, trafficAlertAt: trip.trafficAlertAt },
      now,
      moving,
      nearStop,
    );
    const update: any = { stoppedSince: next.stoppedSince };
    if (next.alert) update.trafficAlertAt = now;
    await repos.TripModel.updateOne({ _id: trip._id }, { $set: update });

    // Live status for parents' maps.
    this.eventsGateway.emitToRoom(trip._id.toString(), 'tripStatus', {
      tripId: trip._id.toString(),
      status: moving ? 'moving' : next.stoppedSeconds >= 60 && !nearStop ? 'delayed' : 'stopped',
      stoppedSeconds: next.stoppedSeconds,
      at: now.toISOString(),
    });

    if (!next.alert) return;
    try {
      const van: any = await repos.VanModel.findById(trip.vanId, { carNumber: 1, driverId: 1, schoolId: 1 }).lean();
      const driver: any = van?.driverId ? await repos.driverModel.findById(van.driverId, { fullname: 1 }).lean() : null;
      const minutes = Math.max(1, Math.round(next.stoppedSeconds / 60));
      const driverName = driver?.fullname || 'Driver';
      const mapUrl = `https://maps.google.com/?q=${lat},${lng}`;

      const alert = await repos.notificationModel.create({
        type: 'traffic_delay', alertType: 'TRAFFIC_DELAY', recipientType: 'ADMIN', infoType: 'Warning',
        driverId: van?.driverId?.toString(), schoolId: trip.schoolId, VanId: trip.vanId,
        title: 'Van delayed in traffic',
        message: `${driverName}${van?.carNumber ? ` (van ${van.carNumber})` : ''} has been stopped for ${minutes} min away from any stop. ${mapUrl}`,
        status: 'sent', date: now,
      });
      this.eventsGateway.emitToSchool(trip.schoolId, 'trafficDelayAlert', {
        alertId: alert._id.toString(), tripId: trip._id.toString(), driverName,
        vanNumber: van?.carNumber || '', location: { lat, lng }, stoppedMinutes: minutes, at: now.toISOString(),
      });

      // Parents of kids still affected by this trip.
      const ids = new Set<string>();
      if (trip.type === 'drop') {
        for (const k of trip.kids || []) if (k.status === 'picked') ids.add(k.kidId?.toString());
        for (const k of trip.kids || []) if (k.status === 'dropped') ids.delete(k.kidId?.toString());
      } else {
        const route: any = await repos.routeModel.findById(trip.routeId, { kidLocations: 1 }).lean();
        const onTrip = new Set((trip.kids || []).map((k: any) => k.kidId?.toString()));
        for (const kl of route?.kidLocations || []) ids.add(kl.kidId.toString());
        // picked kids are in the van — their parents care too; waiting kids as well
        for (const id of onTrip) ids.add(id as string);
      }
      const kids: any[] = ids.size
        ? await repos.KidModel.find({ _id: { $in: [...ids].filter(Boolean).map((id) => new Types.ObjectId(id)) } }, { parentId: 1, fullname: 1 }).lean()
        : [];
      const parentIds = [...new Set(kids.filter((k) => k.parentId).map((k) => k.parentId.toString()))];
      const parents: any[] = parentIds.length
        ? await repos.parentModel.find({ _id: { $in: parentIds }, isDelete: false }, { fcmToken: 1, notificationToggle: 1 }).lean()
        : [];
      await Promise.all(parents.filter((p) => p.fcmToken && p.notificationToggle !== false).map((p) =>
        this.firebaseAdminService.sendToDevice(p.fcmToken, {
          notification: { title: 'Van delayed', body: `The van is stuck in traffic (stopped ${minutes} min). It will be a little late.` },
          data: { type: 'TRAFFIC_DELAY', tripId: trip._id.toString() },
        }),
      ));
    } catch (e) {
      console.error('[traffic] alert failed:', e);
    }
  }
}
