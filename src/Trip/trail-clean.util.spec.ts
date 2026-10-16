import { cleanTrail } from './trail-clean.util';

const T0 = new Date('2026-10-15T14:00:00.000Z').getTime();
const pt = (lat: number, s: number, extra: any = {}) => ({ lat, long: 67.0, time: new Date(T0 + s * 1000), ...extra });

describe('cleanTrail', () => {
  it('leaves a clean trail alone and sums its distance', () => {
    const pts = Array.from({ length: 10 }, (_, i) => pt(24.9 + i * 0.0002, i * 2)); // ~22 m / 2 s
    const r = cleanTrail(pts);
    expect(r.kept).toHaveLength(10);
    expect(r.removed).toBe(0);
    expect(r.distanceMeters).toBeGreaterThan(190);
    expect(r.distanceMeters).toBeLessThan(210);
  });

  it('removes inaccurate fixes', () => {
    const pts = [pt(24.9, 0), pt(24.9001, 2, { accuracy: 200 }), pt(24.9002, 4)];
    expect(cleanTrail(pts).kept).toHaveLength(2);
  });

  it('sorts by device time, not insert order, and counts the inversions', () => {
    const r = cleanTrail([pt(24.9004, 8), pt(24.9, 0), pt(24.9002, 4)]);
    expect(r.kept.map((p) => p.lat)).toEqual([24.9, 24.9002, 24.9004]);
    expect(r.insertOrderInversions).toBe(2);
  });

  it('two phones interleaved: keeps the one that moves, drops the parked one; distance is the real drive', () => {
    const pts: any[] = [];
    for (let i = 0; i < 60; i++) {
      pts.push(pt(24.8 + i * 0.0003, i * 2));        // the real van: ~33 m per 2 s
      pts.push(pt(24.95, i * 2 + 1));                  // a phone parked ~16 km away
    }
    const r = cleanTrail(pts);
    expect(r.kept.every((p) => p.lat < 24.9)).toBe(true);
    expect(r.kept).toHaveLength(60);
    expect(r.distanceMeters).toBeGreaterThan(1900);
    expect(r.distanceMeters).toBeLessThan(2100);
  });

  it('a bad first point does not poison the rest', () => {
    const pts: any[] = [pt(25.2, 0)];
    for (let i = 1; i <= 20; i++) pt && pts.push(pt(24.9 + i * 0.0002, i * 2));
    const r = cleanTrail(pts);
    expect(r.kept.length).toBeGreaterThanOrEqual(20);
    expect(r.kept.every((p) => p.lat < 25)).toBe(true);
  });

  it('empty and junk input', () => {
    expect(cleanTrail([]).kept).toEqual([]);
    expect(cleanTrail([{ lat: NaN, long: 1 } as any]).kept).toEqual([]);
  });
});
