/* eslint-disable prettier/prettier */
import { compareSemver, SEMVER_REGEX } from './semver.util';

describe('semver util', () => {
  it('compares numerically, not lexically', () => {
    expect(compareSemver('1.0.10', '1.0.9')).toBe(1);
    expect(compareSemver('1.10.0', '1.9.9')).toBe(1);
    expect(compareSemver('0.0.0', '1.0.8')).toBe(-1);
    expect(compareSemver('2.0.0', '2.0.0')).toBe(0);
  });
  it('validates format', () => {
    expect(SEMVER_REGEX.test('1.0.8')).toBe(true);
    expect(SEMVER_REGEX.test('1.0')).toBe(false);
    expect(SEMVER_REGEX.test('1.0.8+16')).toBe(false);
    expect(SEMVER_REGEX.test('v1.0.8')).toBe(false);
  });
});
