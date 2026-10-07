/* eslint-disable prettier/prettier */
import * as moment from 'moment-timezone';

export type AbsenceTripType = 'pick' | 'drop' | 'both';

export function isAbsenceTripType(v: unknown): v is AbsenceTripType {
  return v === 'pick' || v === 'drop' || v === 'both';
}

/** Does an absence of [absenceType] cover a trip of [tripType]? */
export function absenceCovers(absenceType: string, tripType: string): boolean {
  return absenceType === 'both' || absenceType === tripType;
}

/**
 * Validates a YYYY-MM-DD date: must be a real date, not in the past, and at
 * most [maxDaysAhead] days ahead (in timezone [tz]). Returns an error or null.
 */
export function validateAbsenceDate(
  date: unknown,
  tz: string,
  now: Date = new Date(),
  maxDaysAhead = 60,
): string | null {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'date must be YYYY-MM-DD';
  const d = moment.tz(date, 'YYYY-MM-DD', true, tz);
  if (!d.isValid()) return 'date is not a valid day';
  const today = moment(now).tz(tz).startOf('day');
  if (d.isBefore(today)) return 'date is in the past';
  if (d.diff(today, 'days') > maxDaysAhead) return `date can be at most ${maxDaysAhead} days ahead`;
  return null;
}

export function todayIn(tz: string, now: Date = new Date()): string {
  return moment(now).tz(tz).format('YYYY-MM-DD');
}
