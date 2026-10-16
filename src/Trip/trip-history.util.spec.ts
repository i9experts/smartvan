/* eslint-disable prettier/prettier */
import {
  applyEndStats, countOutcomes, dayRange, kidOutcome, ownKidIds, parsePaging, simplifyTrail, tripTiming,
} from './trip-history.util';

describe('dayRange (Asia/Karachi)', () => {
  it('uses the PKT calendar day, not UTC', () => {
    // 2026-10-14 20:30 UTC = 2026-10-15 01:30 PKT
    const { from, to } = dayRange('Asia/Karachi', new Date('2026-10-14T20:30:00Z'));
    expect(from.toISOString()).toBe('2026-10-14T19:00:00.000Z');
    expect(to.toISOString()).toBe('2026-10-15T19:00:00.000Z');
  });
  it('a trip ended 23:50 PKT is inside that PKT day, 00:10 next day is not', () => {
    const { from, to } = dayRange('Asia/Karachi', new Date('2026-10-15T10:00:00Z'));
    const inside = new Date('2026-10-15T18:50:00Z'); // 23:50 PKT
    const next = new Date('2026-10-15T19:10:00Z');   // 00:10 PKT next day
    expect(inside >= from && inside < to).toBe(true);
    expect(next >= from && next < to).toBe(false);
  });
});

describe('parsePaging', () => {
  it('defaults and clamps', () => {
    expect(parsePaging(undefined, undefined)).toEqual({ page: 1, limit: 20, skip: 0 });
    expect(parsePaging('3', '1000')).toEqual({ page: 3, limit: 50, skip: 100 });
    expect(parsePaging('-2', '0').page).toBe(1);
  });
});

describe('tripTiming / applyEndStats', () => {
  it('computes duration and rounds distance', () => {
    const trip: any = {
      tripStart: { startTime: new Date('2026-10-15T03:00:00Z') },
      tripEnd: { endTime: new Date('2026-10-15T03:45:30Z') },
      distanceMeters: 1234.6,
    };
    applyEndStats(trip);
    expect(trip.durationSeconds).toBe(2730);
    expect(trip.distanceMeters).toBe(1235);
    expect(trip.endedAt).toEqual(new Date('2026-10-15T03:45:30Z'));
  });
  it('falls back for old trips without the new fields', () => {
    expect(tripTiming({ createdAt: new Date(0), tripEnd: { endTime: new Date(5000) } }).durationSeconds).toBe(5);
  });
});

describe('simplifyTrail', () => {
  const line = Array.from({ length: 5000 }, (_, i) => ({
    lat: 24 + i * 0.00001, lng: 67 + Math.sin(i / 50) * 0.001, t: null,
  }));
  it('caps at max and keeps first and last', () => {
    const out = simplifyTrail(line, 1000);
    expect(out.length).toBeLessThanOrEqual(1000);
    expect(out[0]).toBe(line[0]);
    expect(out[out.length - 1]).toBe(line[line.length - 1]);
  });
  it('drops collinear points and leaves short trails alone', () => {
    const straight = Array.from({ length: 50 }, (_, i) => ({ lat: 24, lng: 67 + i * 0.0001, t: null }));
    expect(simplifyTrail(straight, 10)).toHaveLength(2);
    expect(simplifyTrail(straight.slice(0, 5), 1000)).toHaveLength(5);
  });
});

describe('parent privacy helpers', () => {
  const kids = [
    { _id: 'k1', parentId: 'p1' }, { _id: 'k2', parentId: 'p1' }, { _id: 'k3', parentId: 'p2' },
  ];
  it('ownKidIds returns only the parent\'s children', () => {
    expect([...ownKidIds(kids, 'p1')].sort()).toEqual(['k1', 'k2']);
    expect(ownKidIds(kids, 'p9').size).toBe(0);
  });
  it('kidOutcome + countOutcomes', () => {
    const trip = {
      kids: [{ kidId: 'k1', status: 'picked', time: new Date('2026-10-15T03:10:00Z') }],
      noShows: [{ kidId: 'k2', at: new Date('2026-10-15T03:20:00Z') }],
    };
    const o = ['k1', 'k2', 'k3', 'k4'].map((id) => kidOutcome(id, trip, new Set(['k3'])));
    expect(o.map((x) => x.status)).toEqual(['picked', 'no_show', 'absent', 'pending']);
    expect(countOutcomes(o)).toEqual({ pickedCount: 1, droppedCount: 0, absentCount: 1, noShowCount: 1 });
  });
});

describe('toTrailPoints order', () => {
  const { toTrailPoints } = require('./trip-history.util');
  it('sorts by device time, not insert order', () => {
    const pts = toTrailPoints([
      { lat: 3, long: 3, time: new Date('2026-10-15T10:00:03Z') },
      { lat: 1, long: 1, time: new Date('2026-10-15T10:00:01Z') },
      { lat: 2, long: 2, time: new Date('2026-10-15T10:00:02Z') },
    ]);
    expect(pts.map((p: any) => p.lat)).toEqual([1, 2, 3]);
  });
  it('a point without a time stays after the one before it', () => {
    const pts = toTrailPoints([
      { lat: 1, long: 1, time: new Date('2026-10-15T10:00:01Z') },
      { lat: 2, long: 2 },
      { lat: 3, long: 3, time: new Date('2026-10-15T10:00:03Z') },
    ]);
    expect(pts.map((p: any) => p.lat)).toEqual([1, 2, 3]);
  });
  it('prefers the cleaned trail when the cleanup script wrote one', () => {
    const pts = toTrailPoints(
      [{ lat: 9, long: 9, time: new Date('2026-10-15T10:00:01Z') }],
      [{ lat: 1, long: 1, time: new Date('2026-10-15T10:00:01Z') }],
    );
    expect(pts.map((p: any) => p.lat)).toEqual([1]);
    expect(toTrailPoints([{ lat: 9, long: 9 }], []).map((p: any) => p.lat)).toEqual([9]);
  });
});
