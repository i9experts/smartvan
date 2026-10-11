import { daysUntil } from './driver-docs.util';

const NOW = new Date('2026-10-05T03:00:00Z');

describe('daysUntil', () => {
  it('parses ISO and YYYY-MM-DD', () => {
    expect(daysUntil('2026-10-12', NOW)).toBe(7);
    expect(daysUntil('2026-10-05T18:00:00.000Z', NOW)).toBe(0);
  });
  it('parses DD/MM/YYYY and DD-MM-YYYY', () => {
    expect(daysUntil('04/11/2026', NOW)).toBe(30);
    expect(daysUntil('06-10-2026', NOW)).toBe(1);
  });
  it('negative when expired, null when junk', () => {
    expect(daysUntil('2026-10-01', NOW)).toBe(-4);
    expect(daysUntil('soon', NOW)).toBeNull();
    expect(daysUntil(undefined, NOW)).toBeNull();
  });
});
