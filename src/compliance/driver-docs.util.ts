/* eslint-disable prettier/prettier */

export const DRIVER_DOC_FIELDS = [
  { field: 'expiryDateLicense', label: 'Driving licence' },
  { field: 'expiryDateVehicleCard', label: 'Vehicle card' },
] as const;

/** Days before expiry on which the driver and school are reminded. */
export const DRIVER_ALERT_DAYS = [30, 15, 7, 1, 0];

/**
 * Whole days from [now] until the date in [value] (ISO, YYYY-MM-DD or
 * DD/MM/YYYY). Negative when already expired; null when unparseable.
 */
export function daysUntil(value: unknown, now: Date = new Date()): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim();
  let d: Date;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  if (dmy) {
    d = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
  } else {
    d = new Date(v);
  }
  if (isNaN(d.getTime())) return null;
  const startOf = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  return Math.round((startOf(d) - startOf(now)) / 86_400_000);
}
