/* eslint-disable prettier/prettier */
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TripLiveService } from './trip-live.service';

const oid = () => new Types.ObjectId();
const lean = (v: any) => ({ lean: async () => v });

function setup(tripOver: any = {}) {
  const vanId = oid();
  const trip: any = {
    _id: oid(), vanId: vanId.toString(), status: 'ongoing', trackingSession: null,
    tripStart: { startTime: new Date(Date.now() - 30 * 60_000) },
    ...tripOver,
  };
  const updates: any[] = [];
  const repos: any = {
    TripModel: { findById: () => lean(trip), updateOne: async (f: any, u: any) => { updates.push(u); } },
    VanModel: { findOne: () => lean({ _id: vanId }) },
  };
  const gateway = { setTrackingSession: jest.fn(), emitToRoom: jest.fn() };
  const svc = new TripLiveService({ repositories: repos } as any, {} as any, {} as any, gateway as any, {} as any);
  return { svc, trip, updates, gateway, driverId: oid().toString() };
}

describe('TripLiveService.claimSession', () => {
  it('stores the session and tells the gateway', async () => {
    const { svc, trip, updates, gateway, driverId } = setup();
    const res: any = await svc.claimSession(driverId, trip._id.toString(), { sessionId: 'S1', deviceId: 'D1' });
    expect(res.data).toEqual({ sessionId: 'S1', replaced: false });
    expect(updates[0].$set.trackingSession).toMatchObject({ sessionId: 'S1', deviceId: 'D1' });
    expect(updates[0].$set.pendingJump).toBeNull();
    expect(gateway.setTrackingSession).toHaveBeenCalledWith(trip._id.toString(), 'S1');
    expect(gateway.emitToRoom).not.toHaveBeenCalled();
  });

  it('a new session replaces the old one and the old phone is told', async () => {
    const { svc, trip, gateway, driverId } = setup({ trackingSession: { sessionId: 'OLD' } });
    const res: any = await svc.claimSession(driverId, trip._id.toString(), { sessionId: 'NEW' });
    expect(res.data.replaced).toBe(true);
    expect(gateway.emitToRoom).toHaveBeenCalledWith(trip._id.toString(), 'trackingSessionReplaced', expect.objectContaining({ replacedSessionId: 'OLD' }));
  });

  it('claiming again with the same session is not a replacement', async () => {
    const { svc, trip, gateway, driverId } = setup({ trackingSession: { sessionId: 'S1' } });
    expect(((await svc.claimSession(driverId, trip._id.toString(), { sessionId: 'S1' })) as any).data.replaced).toBe(false);
    expect(gateway.emitToRoom).not.toHaveBeenCalled();
  });

  it('needs a session id, an ongoing trip and the driver\'s own van', async () => {
    const a = setup();
    await expect(a.svc.claimSession(a.driverId, a.trip._id.toString(), {})).rejects.toBeInstanceOf(BadRequestException);
    const b = setup({ status: 'end' });
    await expect(b.svc.claimSession(b.driverId, b.trip._id.toString(), { sessionId: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    const c = setup({ vanId: oid().toString() });
    await expect(c.svc.claimSession(c.driverId, c.trip._id.toString(), { sessionId: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('TripLiveService.backfill', () => {
  const t = (s: number) => new Date(Date.now() - 20 * 60_000 + s * 1000).toISOString();

  it('a replaced session is refused', async () => {
    const { svc, trip, driverId, updates } = setup({ trackingSession: { sessionId: 'NEW' } });
    await expect(svc.backfill(driverId, trip._id.toString(), { sessionId: 'OLD', points: [{ lat: 24.9, lng: 67, time: t(0) }] }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(updates).toHaveLength(0);
  });

  it('no sessionId (old app) is still merged, in device-time order, and tagged only when it sent ids', async () => {
    const { svc, trip, driverId, updates } = setup({ trackingSession: { sessionId: 'NEW' } });
    const res: any = await svc.backfill(driverId, trip._id.toString(), {
      points: [{ lat: 24.9002, lng: 67, time: t(4) }, { lat: 24.9, lng: 67, time: t(0) }, { lat: 24.9001, lng: 67, time: t(2) }],
    });
    expect(res.data.accepted).toBe(3);
    const pushed = updates[0].$push.locations;
    expect(pushed.$sort).toEqual({ time: 1 });
    expect(pushed.$each.map((p: any) => p.lat)).toEqual([24.9, 24.9001, 24.9002]);
    expect(pushed.$each[0].sessionId).toBeUndefined();
  });

  it('stores deviceId/sessionId and drops inaccurate and impossible points', async () => {
    const { svc, trip, driverId, updates } = setup({ trackingSession: { sessionId: 'S1' } });
    const res: any = await svc.backfill(driverId, trip._id.toString(), {
      sessionId: 'S1', deviceId: 'D1',
      points: [
        { lat: 24.9, lng: 67, time: t(0), accuracy: 5 },
        { lat: 24.9001, lng: 67, time: t(2), accuracy: 120 }, // too inaccurate
        { lat: 24.95, lng: 67, time: t(3) },                  // ~5.5 km in 3 s
        { lat: 24.9002, lng: 67, time: t(4), accuracy: 8 },
      ],
    });
    expect(res.data.accepted).toBe(2);
    const each = updates[0].$push.locations.$each;
    expect(each.map((p: any) => p.lat)).toEqual([24.9, 24.9002]);
    expect(each[0]).toMatchObject({ deviceId: 'D1', sessionId: 'S1', accuracy: 5 });
  });
});
