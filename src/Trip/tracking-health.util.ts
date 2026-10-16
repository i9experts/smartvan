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
