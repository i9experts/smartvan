/* eslint-disable prettier/prettier */

/** Fixes less accurate than this (metres) never reach the trail or the distance. */
export const MAX_ACCURACY_METERS = 50;
/** A fix that implies a faster move than this from the last accepted one is a GPS/device glitch. */
export const MAX_SPEED_KMH = 150;
/** A device clock may run a little ahead of the server's. */
export const FUTURE_TOLERANCE_MS = 30_000;
/** This many consecutive rejected-for-speed fixes that agree with each other mean the van really is there. */
export const REANCHOR_AFTER = 5;

export interface GeoSample { lat: number; long: number; time: Date }
export interface PendingJump extends GeoSample { count: number }
export interface Candidate extends GeoSample { accuracy?: number | null }

export type RejectReason = 'accuracy' | 'future' | 'stale' | 'speed';

export interface Verdict {
  accept: boolean;
  reason?: RejectReason;
  /** Store this as the trip's pending jump (null clears it). */
  pending: PendingJump | null;
  /** Accepted only because the jump was confirmed by several fixes in a row. */
  reanchored?: boolean;
}

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** km/h between two samples; the time gap counts as at least one second. */
export function impliedSpeedKmh(from: GeoSample, to: GeoSample): number {
  const seconds = Math.max(1, (to.time.getTime() - from.time.getTime()) / 1000);
  return (haversineMeters(from.lat, from.long, to.lat, to.long) / seconds) * 3.6;
}

/**
 * Should [c] join the trip's trail and distance?
 *  - accuracy over 50 m: no
 *  - time in the future: no
 *  - time before the last accepted fix: no (live points arrive in order;
 *    offline backfill is merged by its own path, not through here)
 *  - implied speed over 150 km/h from the last accepted fix: no — unless
 *    five fixes in a row agree with each other, then the last accepted fix
 *    was the odd one and the trail continues from here.
 */
export function evaluatePoint(
  c: Candidate,
  prev: GeoSample | null | undefined,
  now: Date,
  pending: PendingJump | null | undefined = null,
): Verdict {
  const keep = pending ?? null;
  if (c.accuracy != null && Number.isFinite(c.accuracy) && c.accuracy > MAX_ACCURACY_METERS) {
    return { accept: false, reason: 'accuracy', pending: keep };
  }
  if (c.time.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    return { accept: false, reason: 'future', pending: keep };
  }
  if (!prev) return { accept: true, pending: null };
  if (c.time.getTime() < prev.time.getTime()) {
    return { accept: false, reason: 'stale', pending: keep };
  }
  if (impliedSpeedKmh(prev, c) <= MAX_SPEED_KMH) return { accept: true, pending: null };

  const continues = !!keep
    && c.time.getTime() >= keep.time.getTime()
    && impliedSpeedKmh(keep, c) <= MAX_SPEED_KMH;
  const count = continues ? keep!.count + 1 : 1;
  if (count >= REANCHOR_AFTER) return { accept: true, pending: null, reanchored: true };
  return { accept: false, reason: 'speed', pending: { lat: c.lat, long: c.long, time: c.time, count } };
}

/**
 * Who may write this trip's location right now.
 * `current` is the trip's claimed session; `incoming` what the request sent.
 * A request without a session id (an older app) is always allowed.
 */
export function sessionAllows(
  current: { sessionId?: string } | null | undefined,
  incoming: string | null | undefined,
): boolean {
  if (!incoming || !current?.sessionId) return true;
  return current.sessionId === incoming;
}

export const TRACKING_SESSION_REPLACED = 'TRACKING_SESSION_REPLACED';

/** Reads the optional tracking fields every location request may carry. */
export function readTrackingMeta(src: any, now: Date = new Date()) {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : undefined);
  const acc = Number(src?.accuracy);
  const raw = src?.time ?? src?.at;
  const t = raw == null ? null : new Date(raw);
  return {
    sessionId: str(src?.sessionId),
    deviceId: str(src?.deviceId),
    accuracy: Number.isFinite(acc) && acc >= 0 ? acc : undefined,
    // The phone's own timestamp when it sent a usable one, else the server's.
    time: t && !isNaN(t.getTime()) ? t : now,
  };
}

export interface WritableTrip {
  trackingSession?: { sessionId?: string } | null;
  locations?: { lat: number; long: number; time?: Date | null }[];
  pendingJump?: PendingJump | null;
}

export type WriteDecision =
  | { action: 'replaced' }
  | { action: 'reject'; reason: RejectReason; pending: PendingJump | null }
  | { action: 'accept'; pending: null; reanchored: boolean };

/**
 * One live location against one trip: first the session (a replaced device
 * is told to stop), then the quality filters against the last accepted fix.
 */
export function decideLocationWrite(
  trip: WritableTrip,
  c: Candidate,
  sessionId: string | null | undefined,
  now: Date,
): WriteDecision {
  if (!sessionAllows(trip.trackingSession, sessionId)) return { action: 'replaced' };
  const last = trip.locations?.[trip.locations.length - 1];
  const prev: GeoSample | null = last ? { lat: last.lat, long: last.long, time: last.time ? new Date(last.time) : new Date(0) } : null;
  const v = evaluatePoint(c, prev, now, trip.pendingJump);
  return v.accept
    ? { action: 'accept', pending: null, reanchored: !!v.reanchored }
    : { action: 'reject', reason: v.reason!, pending: v.pending };
}
