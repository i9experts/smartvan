/* eslint-disable prettier/prettier */
import * as moment from 'moment-timezone';
import { downsample } from './polyline.util';

export interface TrailPoint { lat: number; lng: number; t: string | null }

/** [from, to) of the calendar day containing [now] in timezone [tz]. */
export function dayRange(tz: string, now: Date = new Date()): { from: Date; to: Date } {
  const start = moment(now).tz(tz).startOf('day');
  return { from: start.toDate(), to: start.clone().add(1, 'day').toDate() };
}

/** Clamps paging inputs: page >= 1, 1 <= limit <= max. */
export function parsePaging(page: unknown, limit: unknown, defaultLimit = 20, max = 50) {
  const p = Math.max(1, Math.floor(Number(page)) || 1);
  const l = Math.min(max, Math.max(1, Math.floor(Number(limit)) || defaultLimit));
  return { page: p, limit: l, skip: (p - 1) * l };
}

export function parseScope(scope: unknown): 'today' | 'all' {
  return scope === 'today' ? 'today' : 'all';
}

/** startedAt / endedAt / durationSeconds for a finished trip. */
export function tripTiming(trip: {
  startedAt?: Date | null;
  endedAt?: Date | null;
  tripStart?: { startTime?: Date | null } | null;
  tripEnd?: { endTime?: Date | null } | null;
  createdAt?: Date | null;
}) {
  const startedAt = trip.startedAt || trip.tripStart?.startTime || trip.createdAt || null;
  const endedAt = trip.endedAt || trip.tripEnd?.endTime || null;
  const durationSeconds = startedAt && endedAt
    ? Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000))
    : 0;
  return { startedAt, endedAt, durationSeconds };
}

/** Sets startedAt/endedAt/durationSeconds on a trip being ended (distanceMeters is summed live). */
export function applyEndStats(trip: any): void {
  const t = tripTiming(trip);
  trip.startedAt = t.startedAt;
  trip.endedAt = t.endedAt;
  trip.durationSeconds = t.durationSeconds;
  trip.distanceMeters = Math.round(trip.distanceMeters || 0);
}

// ─── Trail simplification ───────────────────────────────────────────

/** Perpendicular distance (metres, equirectangular approximation) from p to segment a-b. */
function perpMeters(p: TrailPoint, a: TrailPoint, b: TrailPoint): number {
  const k = 111_320;
  const cos = Math.cos((a.lat * Math.PI) / 180);
  const ax = a.lng * k * cos, ay = a.lat * k;
  const bx = b.lng * k * cos, by = b.lat * k;
  const px = p.lng * k * cos, py = p.lat * k;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + u * dx), py - (ay + u * dy));
}

/** Iterative Douglas-Peucker; keeps first and last. */
export function douglasPeucker(points: TrailPoint[], epsilonMeters: number): TrailPoint[] {
  if (points.length < 3) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    let maxD = 0, idx = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpMeters(points[i], points[lo], points[hi]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx !== -1 && maxD > epsilonMeters) {
      keep[idx] = true;
      stack.push([lo, idx], [idx, hi]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * At most [max] points: Douglas-Peucker with a growing tolerance (keeps the
 * shape of turns), then even step sampling as a last resort.
 */
export function simplifyTrail(points: TrailPoint[], max = 1000): TrailPoint[] {
  if (points.length <= max) return points;
  let eps = 2;
  let out = points;
  for (let i = 0; i < 12 && out.length > max; i++) {
    out = douglasPeucker(points, eps);
    eps *= 2;
  }
  return out.length > max ? downsample(out, max) : out;
}

/** Raw trip.locations → clean trail points in time order. */
export function toTrailPoints(locations: any[] = []): TrailPoint[] {
  return locations
    .filter((l) => Number.isFinite(l?.lat) && Number.isFinite(l?.long))
    .map((l) => ({ lat: l.lat, lng: l.long, t: l.time ? new Date(l.time).toISOString() : null }));
}

// ─── Stops & statuses ───────────────────────────────────────────────

export type StopStatus = 'picked' | 'dropped' | 'absent' | 'no_show' | 'pending';

export interface KidOutcome { status: StopStatus; at: string | null }

/**
 * What happened to one kid on a trip. Picked/dropped come from trip.kids,
 * no-show from trip.noShows; an absence covering the trip is "absent".
 */
export function kidOutcome(
  kidId: string,
  trip: { kids?: any[]; noShows?: any[] },
  absentKidIds: Set<string>,
): KidOutcome {
  const entry = (trip.kids || []).find((k) => k.kidId?.toString() === kidId);
  if (entry) return { status: entry.status, at: entry.time ? new Date(entry.time).toISOString() : null };
  const ns = (trip.noShows || []).find((n) => n.kidId?.toString() === kidId);
  if (ns) return { status: 'no_show', at: ns.at ? new Date(ns.at).toISOString() : null };
  if (absentKidIds.has(kidId)) return { status: 'absent', at: null };
  return { status: 'pending', at: null };
}

export function countOutcomes(outcomes: KidOutcome[]) {
  const n = (s: StopStatus) => outcomes.filter((o) => o.status === s).length;
  return { pickedCount: n('picked'), droppedCount: n('dropped'), absentCount: n('absent'), noShowCount: n('no_show') };
}

/**
 * Parent-safe view of a trip's kids: only the parent's own children are
 * kept (no names or addresses of anyone else's).
 */
export function ownKidIds(kids: { _id: any; parentId?: any }[], parentId: string): Set<string> {
  return new Set(kids.filter((k) => k.parentId?.toString() === parentId).map((k) => k._id.toString()));
}

export const TRIP_ALERT_TYPES = ['DRIVER_SOS', 'OVERSPEED', 'TRAFFIC_DELAY', 'TRACKING_LOST'];
