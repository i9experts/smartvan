/* eslint-disable prettier/prettier */

export interface TripKidEntry {
  kidId: string;
  status: 'picked' | 'dropped' | string;
}

/**
 * Kids that were picked up on this trip but never dropped.
 *
 * A kid can appear more than once in trip.kids (pickStudent pushes a new
 * entry on every call, dropStudentForHome updates only the first match),
 * so a kid counts as dropped if ANY of their entries is 'dropped'.
 * Returned ids are unique and keep first-seen order.
 */
export function findUndroppedKidIds(kids: TripKidEntry[] = []): string[] {
  const dropped = new Set<string>();
  const seen: string[] = [];
  for (const k of kids) {
    if (!k?.kidId) continue;
    const id = k.kidId.toString();
    if (k.status === 'dropped') dropped.add(id);
    if (!seen.includes(id)) seen.push(id);
  }
  return seen.filter((id) => !dropped.has(id));
}

/** The child-left-behind check only applies to school → home trips. */
export function requiresDropConfirmation(tripType: string | undefined): boolean {
  return tripType === 'drop';
}
