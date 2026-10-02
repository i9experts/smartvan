/* eslint-disable prettier/prettier */
import { TripKidEntry } from './trip-safety.util';

export type ScanAction = 'pick' | 'pickFromSchool' | 'drop' | 'alreadyPicked' | 'alreadyDropped';

/**
 * What a QR scan should do, given the trip type and the kid's entries on
 * this trip so far:
 * - not on the trip yet → pick (from home on a pick trip, from school on a
 *   drop trip)
 * - picked, not dropped → drop (drop trips only; on a pick trip kids are
 *   dropped at school by ending the trip, so a second scan is an error)
 * - already dropped     → nothing (error)
 */
export function decideScanAction(tripType: string, kidId: string, kids: TripKidEntry[] = []): ScanAction {
  const entries = kids.filter((k) => k?.kidId?.toString() === kidId);
  if (entries.some((k) => k.status === 'dropped')) return 'alreadyDropped';
  if (entries.some((k) => k.status === 'picked')) {
    return tripType === 'drop' ? 'drop' : 'alreadyPicked';
  }
  return tripType === 'drop' ? 'pickFromSchool' : 'pick';
}
