/* eslint-disable prettier/prettier */
import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { EventsGateway } from '../events/events.gateway';
import { TripHistoryService } from './trip-history.service';
import { TripLiveService } from './trip-live.service';
import { dateRange } from './trip-history.util';
import { liveTripStatus } from './tracking-health.util';

const oid = () => new Types.ObjectId();
const chain = (rows: any) => {
  const c: any = { sort: () => c, skip: () => c, limit: () => c, select: () => c, lean: async () => rows };
  return c;
};

const schoolA = oid(), schoolB = oid();
const adminA = oid(), adminB = oid();
const tripB: any = {
  _id: oid(), status: 'end', type: 'pick', schoolId: schoolB.toString(), vanId: oid().toString(), routeId: oid().toString(),
  tripStart: { startTime: new Date('2026-10-15T02:00:00Z') }, tripEnd: { endTime: new Date('2026-10-15T02:40:00Z') }, kids: [], noShows: [],
};

function setup() {
  const finds: any[] = [];
  const repos: any = {
    SchoolModel: {
      findOne: (f: any) => chain(f.admin.toString() === adminA.toString() ? { _id: schoolA } : f.admin.toString() === adminB.toString() ? { _id: schoolB } : null),
      findById: () => chain({ schoolName: 'S', lat: 24, long: 67 }),
    },
    TripModel: {
      find: (f: any) => { finds.push(f); return chain(f.schoolId === schoolB.toString() ? [tripB] : []); },
      findById: () => chain(tripB),
      countDocuments: async () => 0,
    },
    VanModel: { find: () => chain([]), findById: () => chain(null) },
    routeModel: { find: () => chain([]), findById: () => chain(null) },
    KidModel: { find: () => chain([]) },
    driverModel: { find: () => chain([]) },
    kidAbsenceModel: { find: () => chain([]) },
    notificationModel: { find: () => chain([]) },
  };
  const svc = new TripHistoryService({ repositories: repos } as any);
  const live = new TripLiveService({ repositories: repos } as any, {} as any, {} as any, {} as any, {} as any);
  return { svc, live, finds };
}
const admin = (id: Types.ObjectId) => ({ role: 'admin', userId: id.toString() });

describe('admin trips — school scoping', () => {
  it('active / completed query only the caller\'s school', async () => {
    const { svc, finds } = setup();
    await svc.adminActive(admin(adminA));
    await svc.adminCompleted(admin(adminA), {});
    expect(finds.map((f) => f.schoolId)).toEqual([schoolA.toString(), schoolA.toString()]);
    const res: any = await svc.adminCompleted(admin(adminB), {});
    expect(res.data.items).toHaveLength(1); // B sees B's trip
    expect((await svc.adminCompleted(admin(adminA), {}) as any).data.items).toHaveLength(0); // A does not
  });

  it('a ?schoolId= from an admin is ignored; superadmin must pass it', async () => {
    const { svc, finds } = setup();
    await svc.adminCompleted(admin(adminA), { schoolId: schoolB.toString() });
    expect(finds[0].schoolId).toBe(schoolA.toString());
    await expect(svc.adminCompleted({ role: 'superadmin', userId: 'x' }, {})).rejects.toMatchObject({ response: { code: 'SCHOOL_ID_REQUIRED' } });
    await svc.adminCompleted({ role: 'superadmin', userId: 'x' }, { schoolId: schoolB.toString() });
    expect(finds[1].schoolId).toBe(schoolB.toString());
  });

  it('school A admin cannot open school B trip details, B can', async () => {
    const { svc } = setup();
    await expect(svc.adminDetails(admin(adminA), tripB._id.toString())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.adminDetails(admin(adminB), tripB._id.toString())).resolves.toMatchObject({ success: true });
  });

  it('parents/drivers are refused', async () => {
    const { svc } = setup();
    await expect(svc.adminActive({ userType: 'parent', userId: 'p' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('school_staff use their own school', async () => {
    const { svc, finds } = setup();
    await svc.adminActive({ role: 'school_staff', userId: 's', schoolId: schoolB.toString() });
    expect(finds[0].schoolId).toBe(schoolB.toString());
  });

  it('trail and route-plan: school A admin gets 403 on school B trip', async () => {
    const { live } = setup();
    await expect(live.trail(admin(adminA), tripB._id.toString())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(live.routePlan(admin(adminA), tripB._id.toString())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(live.trail(admin(adminB), tripB._id.toString())).resolves.toMatchObject({ success: true });
    await expect(live.trail({ role: 'school_staff', schoolId: schoolA.toString(), userId: 's' }, tripB._id.toString())).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('admin trips — dates in PKT', () => {
  it('from/to are inclusive Karachi days', () => {
    const r: any = dateRange('Asia/Karachi', '2026-10-15', '2026-10-15');
    expect(r.$gte.toISOString()).toBe('2026-10-14T19:00:00.000Z'); // 00:00 PKT
    expect(r.$lt.toISOString()).toBe('2026-10-15T19:00:00.000Z');  // next 00:00 PKT
  });
  it('rejects bad dates, leaves absent bounds open', () => {
    expect(dateRange('Asia/Karachi', '15-10-2026')).toBeNull();
    expect(dateRange('Asia/Karachi', '2026-02-30')).toBeNull();
    expect(dateRange('Asia/Karachi', undefined, '2026-10-15')).toEqual({ $lt: new Date('2026-10-15T19:00:00.000Z') });
  });
  it('adminCompleted filters tripEnd.endTime and tripType', async () => {
    const { svc, finds } = setup();
    await svc.adminCompleted(admin(adminA), { from: '2026-10-15', to: '2026-10-16', tripType: 'drop', vanId: 'v1' });
    expect(finds[0]['tripEnd.endTime'].$gte.toISOString()).toBe('2026-10-14T19:00:00.000Z');
    expect(finds[0]['tripEnd.endTime'].$lt.toISOString()).toBe('2026-10-16T19:00:00.000Z');
    expect(finds[0]).toMatchObject({ type: 'drop', vanId: 'v1', status: 'end' });
    await expect(svc.adminCompleted(admin(adminA), { from: 'nope' })).rejects.toMatchObject({ response: { code: 'INVALID_DATE' } });
  });
});

describe('adminTripLocation socket throttle', () => {
  function gw() {
    const g = new EventsGateway({} as any, {} as any, {} as any, {} as any);
    const out: any[] = [];
    (g as any).server = { to: (room: string) => ({ emit: (ev: string, p: any) => out.push([room, ev, p]) }) };
    return { g, out };
  }
  const pt = (tripId = 't1') => ({ tripId, lat: 24.9, lng: 67, heading: 90, speed: 30, status: 'moving' });

  it('≤ 1 per 3 s per trip, to the school room', () => {
    const { g, out } = gw();
    expect(g.emitAdminTripLocation('s1', pt(), 10_000)).toBe(true);
    expect(g.emitAdminTripLocation('s1', pt(), 11_000)).toBe(false);
    expect(g.emitAdminTripLocation('s1', pt(), 12_999)).toBe(false);
    expect(g.emitAdminTripLocation('s1', pt(), 13_000)).toBe(true);
    expect(out.map((o) => [o[0], o[1]])).toEqual([['school:s1', 'adminTripLocation'], ['school:s1', 'adminTripLocation']]);
    expect(out[0][2]).toMatchObject({ tripId: 't1', lat: 24.9, lng: 67, heading: 90, speed: 30, status: 'moving', t: new Date(10_000).toISOString() });
  });
  it('throttles per trip, not globally; no school → nothing', () => {
    const { g, out } = gw();
    g.emitAdminTripLocation('s1', pt('a'), 1000);
    g.emitAdminTripLocation('s1', pt('b'), 1001);
    expect(out).toHaveLength(2);
    expect(g.emitAdminTripLocation(undefined, pt('c'), 5000)).toBe(false);
  });
  it('socket relay emits once for a burst of accepted fixes and not for rejected ones', async () => {
    const vanId = oid();
    const trip = { _id: oid(), vanId: vanId.toString(), schoolId: 'sch', status: 'ongoing', trackingSession: null };
    const repos: any = { TripModel: { findById: () => chain(trip) }, VanModel: { findOne: () => chain({ _id: vanId }) } };
    const g = new EventsGateway({ repositories: repos } as any, {} as any, {} as any, {} as any);
    const out: any[] = [];
    (g as any).server = { to: (room: string) => ({ emit: (ev: string, p: any) => out.push([room, ev, p]) }) };
    const socket: any = { decoded_token: { userType: 'driver', userId: oid().toString() }, rooms: new Set([trip._id.toString()]), join: async () => undefined, emit: jest.fn(), data: {} };
    const send = (lat: number, extra: any = {}) => g.updateLocation({ tripId: trip._id.toString(), location: { lat, lng: 67 }, ...extra } as any, socket);
    await send(24.9, { speed: 10 });
    await send(24.9001, { speed: 10 });
    await send(24.95, { accuracy: 90 }); // rejected
    const admin = out.filter((o) => o[1] === 'adminTripLocation');
    expect(admin).toHaveLength(1);
    expect(admin[0][0]).toBe('school:sch');
    expect(admin[0][2]).toMatchObject({ status: 'moving', speed: 36 });
  });
});

describe('liveTripStatus', () => {
  const now = new Date('2026-10-16T05:00:00Z');
  const ago = (s: number) => new Date(now.getTime() - s * 1000);
  it('maps stored state', () => {
    expect(liveTripStatus({}, now)).toBe('offline');
    expect(liveTripStatus({ lastFixAt: ago(10) }, now)).toBe('moving');
    expect(liveTripStatus({ lastFixAt: ago(10), accuracy: 60 }, now)).toBe('weak_signal');
    expect(liveTripStatus({ lastFixAt: ago(60) }, now)).toBe('weak_signal');
    expect(liveTripStatus({ lastFixAt: ago(10), stoppedSince: ago(30) }, now)).toBe('stopped');
    expect(liveTripStatus({ lastFixAt: ago(10), stoppedSince: ago(300), trafficAlertAt: ago(60) }, now)).toBe('delayed');
    expect(liveTripStatus({ lastFixAt: ago(600) }, now)).toBe('offline');
  });
});
