/* eslint-disable prettier/prettier */

export type Point = { lat: number; lng: number };

/** A stop's state on a trip, as the live route plan reports it. */
export type StopState = 'dropped' | 'picked' | 'no_show' | 'absent' | 'waiting';

/**
 * One kid's state on a trip. A kid can have several `trip.kids` entries
 * (picked, then dropped), so the furthest one wins; otherwise no-show, then
 * absent, else still waiting.
 */
export function stopStateOf(
  entries: { kidId?: any; status?: string }[],
  kidId: string,
  noShow: Set<string>,
  absent: Set<string>,
): StopState {
  const mine = entries.filter((k) => k.kidId?.toString() === kidId);
  if (mine.some((k) => k.status === 'dropped')) return 'dropped';
  if (mine.some((k) => k.status === 'picked')) return 'picked';
  if (noShow.has(kidId)) return 'no_show';
  if (absent.has(kidId)) return 'absent';
  return 'waiting';
}

/**
 * Stops the van still has to visit: kids waiting at home on a pick trip, kids
 * still in the van on a drop trip. Done, absent and no-show stops are not
 * revisited.
 */
export function remainingKidIds(
  type: string,
  order: string[],
  stateOf: (kidId: string) => StopState,
): string[] {
  return order.filter((id) => stateOf(id) === (type === 'drop' ? 'picked' : 'waiting'));
}

/** Great-circle distance in metres. */
export function haversineMeters(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Google Directions takes 25 waypoints; keep a little room. */
export const MAX_OPTIMIZED_WAYPOINTS = 23;

export interface OptimizationPlan {
  origin: Point;
  /** Where the route must end (Google keeps it fixed). */
  destination: Point;
  /** The stop that is the destination, if it is one (not the school). */
  destinationKidId: string | null;
  /** Stops Google may reorder, in the current visiting order. */
  waypointKidIds: string[];
  /** Remaining stops beyond Google's waypoint limit, kept as they are. */
  untouchedKidIds: string[];
}

/**
 * Chooses origin, destination and the reorderable waypoints for the stops
 * still to visit:
 * - pick trip → from the van through the stops to the school (a fixed end);
 *   without a school location the furthest stop is the end;
 * - drop trip → from the van through the stops; the furthest stop from the
 *   van is the end, since a drop trip has no fixed finish.
 * Returns null when there is nothing left to visit.
 */
export function planOptimization(args: {
  type: string;
  remaining: string[];
  points: Map<string, Point>;
  school: Point | null;
  origin: Point;
}): OptimizationPlan | null {
  const { type, remaining, points, school, origin } = args;
  const ids = remaining.filter((id) => points.has(id));
  if (!ids.length) return null;

  let destination: Point;
  let destinationKidId: string | null = null;
  let rest = ids;
  if (type !== 'drop' && school) {
    destination = school;
  } else {
    let far = 0;
    for (let i = 1; i < ids.length; i++) {
      if (haversineMeters(origin, points.get(ids[i])!) > haversineMeters(origin, points.get(ids[far])!)) far = i;
    }
    destinationKidId = ids[far];
    destination = points.get(destinationKidId)!;
    rest = ids.filter((_, i) => i !== far);
  }
  return {
    origin,
    destination,
    destinationKidId,
    waypointKidIds: rest.slice(0, MAX_OPTIMIZED_WAYPOINTS),
    untouchedKidIds: rest.slice(MAX_OPTIMIZED_WAYPOINTS),
  };
}

/**
 * The full visiting order after an optimization: stops already done keep
 * their place (so their numbers on the map do not change), then the
 * optimized stops, then the destination stop and any stops left untouched.
 */
export function mergeStopOrder(
  currentOrder: string[],
  remaining: string[],
  optimizedWaypointIds: string[],
  plan: Pick<OptimizationPlan, 'destinationKidId' | 'untouchedKidIds'>,
): string[] {
  const left = new Set(remaining);
  return [
    ...currentOrder.filter((id) => !left.has(id)),
    ...optimizedWaypointIds,
    ...(plan.destinationKidId ? [plan.destinationKidId] : []),
    ...plan.untouchedKidIds,
  ];
}
