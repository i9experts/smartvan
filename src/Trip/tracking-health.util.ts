/* eslint-disable prettier/prettier */

/** Minutes without any location before an ongoing trip counts as "tracking lost". */
export function trackingLostMinutes(raw: string | undefined = process.env.TRACKING_LOST_MINUTES): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 2 ? n : 4;
}

export interface BackfillPoint {
  lat: number;
  long: number;
  time: Date;
  speedKmh?: number;
  accuracy?: number;
}

/**
 * Cleans points the driver app stored while offline: valid coordinates,
 * a parseable time inside the trip window (not in the future), sorted,
 * de-duplicated by time, max [max] points.
 */
export function cleanBackfill(
  raw: unknown,
  window: { from: Date; to: Date },
  max = 2000,
): BackfillPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: BackfillPoint[] = [];
  const seen = new Set<number>();
  for (const p of raw as any[]) {
    const lat = Number(p?.lat);
    const lng = Number(p?.lng ?? p?.long);
    const t = new Date(p?.time ?? p?.at);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    if (lat === 0 && lng === 0) continue;
    if (isNaN(t.getTime()) || t < window.from || t > window.to) continue;
    if (seen.has(t.getTime())) continue;
    seen.add(t.getTime());
    const speed = Number(p?.speed);
    const accuracy = Number(p?.accuracy);
    out.push({
      lat,
      long: lng,
      time: t,
      ...(Number.isFinite(speed) && speed >= 0 && speed < 70 ? { speedKmh: Math.round(speed * 3.6) } : {}),
      ...(p?.accuracy != null && Number.isFinite(accuracy) && accuracy >= 0 ? { accuracy } : {}),
    });
  }
  out.sort((a, b) => a.time.getTime() - b.time.getTime());
  return out.slice(0, max);
}

export type LiveTripStatus = 'moving' | 'stopped' | 'delayed' | 'weak_signal' | 'offline';

/** A fix older than this (but not yet "offline") means the phone has a weak connection. */
export const WEAK_SIGNAL_SECONDS = 45;
/** GPS accuracy (metres) worse than this counts as weak signal. */
export const WEAK_ACCURACY_METERS = 30;

/**
 * Live status of an ongoing trip for the admin map, from what is stored on
 * the trip: offline (no fix for TRACKING_LOST_MINUTES) > weak signal (old or
 * inaccurate fix) > delayed (traffic alert raised in the last 10 min while
 * still stopped) > stopped > moving.
 */
export function liveTripStatus(
  t: { lastFixAt?: Date | string | null; accuracy?: number | null; stoppedSince?: Date | string | null; trafficAlertAt?: Date | string | null },
  now: Date = new Date(),
): LiveTripStatus {
  const lastMs = t.lastFixAt ? new Date(t.lastFixAt).getTime() : NaN;
  if (!Number.isFinite(lastMs)) return 'offline';
  const ageSec = (now.getTime() - lastMs) / 1000;
  if (ageSec >= trackingLostMinutes() * 60) return 'offline';
  if (ageSec >= WEAK_SIGNAL_SECONDS || (t.accuracy != null && t.accuracy > WEAK_ACCURACY_METERS)) return 'weak_signal';
  if (t.stoppedSince) {
    const alertMs = t.trafficAlertAt ? new Date(t.trafficAlertAt).getTime() : NaN;
    return Number.isFinite(alertMs) && now.getTime() - alertMs <= 10 * 60_000 ? 'delayed' : 'stopped';
  }
  return 'moving';
}
