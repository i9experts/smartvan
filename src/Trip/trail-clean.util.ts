/* eslint-disable prettier/prettier */
import { evaluatePoint, FUTURE_TOLERANCE_MS, GeoSample, haversineMeters, PendingJump } from './location-guard.util';
import { MAX_SEGMENT_METERS } from './location-pipeline.util';

export interface RawPoint { lat: number; long: number; time?: Date | string | null; accuracy?: number | null; [k: string]: any }

export interface CleanResult {
  kept: RawPoint[];
  removed: number;
  distanceMeters: number;
  /** Original points that were out of device-time order in insert order. */
  insertOrderInversions: number;
}

/** How many of the first points are tried as the starting anchor of the trail. */
const ANCHOR_TRIES = 8;

function chain(points: { p: RawPoint; time: Date }[], start: number, now: Date) {
  const kept: RawPoint[] = [];
  let prev: GeoSample | null = null;
  let pending: PendingJump | null = null;
  let distance = 0;
  for (let i = start; i < points.length; i++) {
    const { p, time } = points[i];
    const v = evaluatePoint({ lat: p.lat, long: p.long, time, accuracy: p.accuracy }, prev, now, pending);
    pending = v.pending;
    if (!v.accept) continue;
    if (prev && !v.reanchored) {
      const seg = haversineMeters(prev.lat, prev.long, p.lat, p.long);
      if (seg <= MAX_SEGMENT_METERS) distance += seg;
    }
    kept.push(p);
    prev = { lat: p.lat, long: p.long, time };
  }
  return { kept, distance };
}

/**
 * An existing trip's points → the trail the van really drove: sorted by
 * device time, then the same filters as live points (accuracy, speed,
 * order). When two phones wrote the same trip their points interleave and
 * either one could be "the trail", so the first few points are each tried
 * as the starting anchor and the longest consistent chain wins (ties go to
 * the one that covers more ground — a parked phone covers none).
 */
export function cleanTrail(raw: RawPoint[]): CleanResult {
  let carry = 0;
  let inversions = 0;
  let lastInsertMs = -Infinity;
  const withTime = (raw || [])
    .filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.long) && !(p.lat === 0 && p.long === 0))
    .map((p, i) => {
      const ms = p.time ? new Date(p.time).getTime() : NaN;
      if (Number.isFinite(ms)) {
        if (ms < lastInsertMs) inversions++;
        lastInsertMs = Math.max(lastInsertMs, ms);
        carry = ms;
      }
      return { p, ms: Number.isFinite(ms) ? ms : carry, i };
    })
    .sort((a, b) => a.ms - b.ms || a.i - b.i)
    .map((r) => ({ p: r.p, time: new Date(r.ms) }));
  if (!withTime.length) return { kept: [], removed: raw?.length || 0, distanceMeters: 0, insertOrderInversions: inversions };

  const now = new Date(withTime[withTime.length - 1].time.getTime() + FUTURE_TOLERANCE_MS);
  let best = chain(withTime, 0, now);
  for (let s = 1; s < Math.min(ANCHOR_TRIES, withTime.length); s++) {
    const c = chain(withTime, s, now);
    const better = c.kept.length > best.kept.length
      || (c.kept.length === best.kept.length && c.distance > best.distance);
    if (better) best = c;
  }
  return {
    kept: best.kept,
    removed: (raw?.length || 0) - best.kept.length,
    distanceMeters: Math.round(best.distance),
    insertOrderInversions: inversions,
  };
}
