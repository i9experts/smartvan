/* eslint-disable prettier/prettier */
import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TripHistoryService } from './trip-history.service';

const oid = () => new Types.ObjectId();
const chain = (rows: any) => {
  const c: any = { sort: () => c, skip: () => c, limit: () => c, select: () => c, lean: async () => rows };
  return c;
};

function setup() {
  const parentId = oid().toString();
  const otherParent = oid().toString();
  const myKid = { _id: oid(), fullname: 'Mine Kid', parentId: new Types.ObjectId(parentId), homeAddress: 'My House' };
  const otherKid = { _id: oid(), fullname: 'Secret Other Kid', parentId: new Types.ObjectId(otherParent), homeAddress: '99 Secret Street' };
  const routeId = oid().toString();
  const route = {
    _id: routeId, title: 'Route A',
    kidLocations: [
      { kidId: otherKid._id, lat: 24.1, long: 67.1, address: '99 Secret Street' },
      { kidId: myKid._id, lat: 24.2, long: 67.2, address: 'My House' },
    ],
  };
  const trip: any = {
    _id: oid(), status: 'end', type: 'pick', vanId: oid().toString(), schoolId: oid().toString(), routeId, driverId: oid().toString(),
    tripStart: { startTime: new Date('2026-10-15T02:00:00Z') }, tripEnd: { endTime: new Date('2026-10-15T02:40:00Z') },
    distanceMeters: 8000,
    kids: [
      { kidId: otherKid._id.toString(), status: 'picked', time: new Date('2026-10-15T02:10:00Z') },
      { kidId: myKid._id.toString(), status: 'picked', time: new Date('2026-10-15T02:20:00Z') },
    ],
    noShows: [],
  };
  const calls: any = { tripFind: [] };
  const repos: any = {
    KidModel: { find: (f: any) => chain([myKid, otherKid].filter((k) => !f.parentId || k.parentId.toString() === f.parentId.toString())
      .filter((k) => !f._id || f._id.$in.some((i: any) => i.toString() === k._id.toString()))) },
    routeModel: { find: () => chain([route]), findById: () => chain(route) },
    TripModel: {
      find: (f: any) => { calls.tripFind.push(f); return chain([trip]); },
      findById: () => chain(trip),
      countDocuments: async () => 1,
    },
    VanModel: { findById: () => chain({ carNumber: 'KHI-123', driverId: trip.driverId }), findOne: () => chain({ _id: oid() }) },
    SchoolModel: { findById: () => chain({ schoolName: 'S', lat: 24.3, long: 67.3 }) },
    driverModel: { findById: () => chain({ fullname: 'Driver Dan' }) },
    kidAbsenceModel: { find: () => chain([]) },
    notificationModel: { find: () => chain([]) },
  };
  const svc = new TripHistoryService({ repositories: repos } as any);
  return { svc, parentId, otherParent, trip, repos, calls };
}

describe('TripHistoryService parent privacy', () => {
  it('details expose only the parent\'s own child, driver, van, school', async () => {
    const { svc, parentId } = setup();
    const res: any = await svc.parentDetails(parentId, setupTripId());
    const json = JSON.stringify(res);
    expect(json).toContain('Mine Kid');
    expect(json).not.toContain('Secret Other Kid');
    expect(json).not.toContain('Secret Street');
    expect(res.data.children).toHaveLength(1);
    expect(res.data.driverName).toBe('Driver Dan');
    expect(res.data.vanNumber).toBe('KHI-123');
    expect(res.data.durationSeconds).toBe(2400);
    expect(res.data).not.toHaveProperty('stops');
    expect(res.data).not.toHaveProperty('studentCount');
  });

  it('list rows are privacy-safe too', async () => {
    const { svc, parentId } = setup();
    const res: any = await svc.parentCompleted(parentId, { scope: 'all' });
    expect(JSON.stringify(res)).not.toContain('Secret');
    expect(res.data.items[0].children.map((c: any) => c.name)).toEqual(['Mine Kid']);
  });

  it('rejects a parent whose child was not on the trip', async () => {
    const { svc, repos } = setup();
    repos.TripModel.countDocuments = async () => 0;
    await expect(svc.parentDetails(oid().toString(), oid().toString())).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// parentDetails validates the id format only; the mocks ignore its value.
function setupTripId() { return oid().toString(); }

describe('TripHistoryService today filter', () => {
  it('scope=today filters on the PKT day of tripEnd.endTime; scope=all does not', async () => {
    const { svc, calls } = setup();
    // 2026-10-14 20:30 UTC = 15 Oct 01:30 PKT
    await svc.driverCompleted(oid().toString(), { scope: 'today' }, new Date('2026-10-14T20:30:00Z'));
    const f = calls.tripFind[0];
    expect(f['tripEnd.endTime'].$gte.toISOString()).toBe('2026-10-14T19:00:00.000Z');
    expect(f['tripEnd.endTime'].$lt.toISOString()).toBe('2026-10-15T19:00:00.000Z');
    await svc.driverCompleted(oid().toString(), { scope: 'all' });
    expect(calls.tripFind[1]['tripEnd.endTime']).toBeUndefined();
  });

  it('driver list item has the agreed fields and pagination', async () => {
    const { svc } = setup();
    const res: any = await svc.driverCompleted(oid().toString(), { scope: 'all', page: '1', limit: '10' });
    expect(res.data).toMatchObject({ total: 1, page: 1, hasMore: false });
    expect(Object.keys(res.data.items[0])).toEqual(expect.arrayContaining([
      'id', 'routeName', 'tripType', 'date', 'startedAt', 'endedAt', 'durationSeconds', 'distanceMeters',
      'studentCount', 'pickedCount', 'droppedCount', 'absentCount', 'noShowCount',
    ]));
    expect(res.data.items[0]).toMatchObject({ studentCount: 2, pickedCount: 2, date: '2026-10-15' });
  });
});
