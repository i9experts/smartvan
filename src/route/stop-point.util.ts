/* eslint-disable prettier/prettier */

const valid = (lat: unknown, lng: unknown): boolean =>
  typeof lat === 'number' && typeof lng === 'number' &&
  Number.isFinite(lat) && Number.isFinite(lng) &&
  Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
  !(lat === 0 && lng === 0);

/**
 * Where the van stops for a child: the route stop's own coordinates, or —
 * when the stop was saved without a location (stored as 0,0) — the child's
 * home location (homeLat/homeLng). Null if neither is set.
 *
 * Kids were added to routes with lat/long 0 when the admin didn't pick a
 * point, and setting the child's home later never updated the route, so
 * ETA, geofence and the live map had nothing to work with.
 */
export function resolveStopPoint(
  stop: { lat?: number; long?: number } | null | undefined,
  kid?: { homeLat?: number; homeLng?: number } | null,
): { lat: number; lng: number } | null {
  if (stop && valid(stop.lat, stop.long)) return { lat: stop.lat as number, lng: stop.long as number };
  if (kid && valid(kid.homeLat, kid.homeLng)) return { lat: kid.homeLat as number, lng: kid.homeLng as number };
  return null;
}

export function isValidPoint(lat: unknown, lng: unknown): boolean {
  return valid(lat, lng);
}
