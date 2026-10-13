import { cleanBackfill, trackingLostMinutes } from './tracking-health.util';

const from = new Date('2026-10-12T06:00:00Z');
const to = new Date('2026-10-12T07:00:00Z');

describe('tracking health utils', () => {
  it('lost threshold', () => {
    expect(trackingLostMinutes(undefined)).toBe(4);
    expect(trackingLostMinutes('6')).toBe(6);
    expect(trackingLostMinutes('1')).toBe(4);
  });

  it('cleans, sorts and de-dupes offline points', () => {
    const pts = cleanBackfill(
      [
        { lat: 24.9, lng: 67.0, time: '2026-10-12T06:10:05Z', speed: 10 },
        { lat: 24.8, lng: 67.1, time: '2026-10-12T06:10:00Z' },
        { lat: 24.8, lng: 67.1, time: '2026-10-12T06:10:00Z' }, // duplicate time
        { lat: 0, lng: 0, time: '2026-10-12T06:11:00Z' }, // 0,0
        { lat: 24.8, lng: 67.1, time: '2026-10-12T08:00:00Z' }, // outside window
        { lat: 'x', lng: 67.1, time: '2026-10-12T06:12:00Z' }, // bad
      ],
      { from, to },
    );
    expect(pts.map((p) => p.time.toISOString())).toEqual(['2026-10-12T06:10:00.000Z', '2026-10-12T06:10:05.000Z']);
    expect(pts[1].speedKmh).toBe(36);
    expect(pts[0].long).toBe(67.1);
  });

  it('caps the number of points and rejects non-arrays', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ lat: 24.8, lng: 67, time: new Date(from.getTime() + i * 1000).toISOString() }));
    expect(cleanBackfill(many, { from, to }, 3)).toHaveLength(3);
    expect(cleanBackfill('nope', { from, to })).toEqual([]);
  });
});
