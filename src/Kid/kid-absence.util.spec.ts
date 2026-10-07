import { absenceCovers, isAbsenceTripType, todayIn, validateAbsenceDate } from './kid-absence.util';

const TZ = 'Asia/Karachi';
const NOW = new Date('2026-10-05T06:00:00Z'); // 11:00 in Karachi, 2026-10-05

describe('kid absence utils', () => {
  it('trip type coverage', () => {
    expect(absenceCovers('both', 'pick')).toBe(true);
    expect(absenceCovers('both', 'drop')).toBe(true);
    expect(absenceCovers('pick', 'pick')).toBe(true);
    expect(absenceCovers('pick', 'drop')).toBe(false);
    expect(isAbsenceTripType('drop')).toBe(true);
    expect(isAbsenceTripType('x')).toBe(false);
  });

  it('validates dates', () => {
    expect(validateAbsenceDate('2026-10-05', TZ, NOW)).toBeNull();
    expect(validateAbsenceDate('2026-10-06', TZ, NOW)).toBeNull();
    expect(validateAbsenceDate('2026-10-04', TZ, NOW)).toMatch(/past/);
    expect(validateAbsenceDate('2026-13-01', TZ, NOW)).toMatch(/valid/);
    expect(validateAbsenceDate('05-10-2026', TZ, NOW)).toMatch(/YYYY/);
    expect(validateAbsenceDate('2027-01-30', TZ, NOW)).toMatch(/at most/);
  });

  it('today in timezone', () => {
    expect(todayIn(TZ, new Date('2026-10-04T20:30:00Z'))).toBe('2026-10-05');
  });
});
