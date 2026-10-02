/* eslint-disable prettier/prettier */
import { TripKidEntry } from './trip-safety.util';

/**
 * Kids still waiting for the van at their home stop:
 * - pick trip: route kids not picked yet (no entry on the trip)
 * - drop trip: kids in the van (picked, not dropped)
 */
export function waitingKidIds(
  tripType: string,
  routeKidIds: string[],
  tripKids: TripKidEntry[] = [],
): string[] {
  const onTrip = new Set(tripKids.map((k) => k.kidId?.toString()));
  const dropped = new Set(
    tripKids.filter((k) => k.status === 'dropped').map((k) => k.kidId?.toString()),
  );
  if (tripType === 'drop') {
    return [...new Set(
      tripKids
        .filter((k) => k.status === 'picked' && !dropped.has(k.kidId?.toString()))
        .map((k) => k.kidId.toString()),
    )];
  }
  return [...new Set(routeKidIds.map(String))].filter((id) => !onTrip.has(id));
}

/** ETA thresholds (minutes) at which a parent gets one push each. */
export const ETA_THRESHOLDS = [10, 3];

/**
 * Which threshold push to send now for this kid, if any. Returns the
 * threshold to announce plus every threshold key to mark as sent (crossing
 * 10 and 3 at once sends only the 3-minute push). Keys look like "kidId:10".
 */
export function etaPushToSend(
  kidId: string,
  minutes: number,
  alreadySent: string[] = [],
): { threshold: number; markSent: string[] } | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const crossed = ETA_THRESHOLDS.filter((t) => minutes <= t && !alreadySent.includes(`${kidId}:${t}`));
  if (!crossed.length) return null;
  return {
    threshold: Math.min(...crossed),
    markSent: ETA_THRESHOLDS.filter((t) => minutes <= t).map((t) => `${kidId}:${t}`),
  };
}

export function overspeedLimitKmh(raw: string | undefined = process.env.OVERSPEED_LIMIT_KMH): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

/** m/s from the phone → km/h; null when missing or obviously bogus. */
export function speedKmh(speedMs: unknown): number | null {
  if (typeof speedMs !== 'number' || !Number.isFinite(speedMs) || speedMs < 0) return null;
  const kmh = speedMs * 3.6;
  return kmh > 200 ? null : Math.round(kmh);
}

/** GPS jumps longer than this between two fixes are ignored for distance. */
export const MAX_SEGMENT_METERS = 2000;
