import { isValidPoint, resolveStopPoint } from './stop-point.util';

describe('resolveStopPoint', () => {
  it('uses the route stop when it has a location', () => {
    expect(resolveStopPoint({ lat: 24.9, long: 67.1 }, { homeLat: 1, homeLng: 1 })).toEqual({ lat: 24.9, lng: 67.1 });
  });
  it('falls back to the child home when the stop is 0,0', () => {
    expect(resolveStopPoint({ lat: 0, long: 0 }, { homeLat: 24.8, homeLng: 67.0 })).toEqual({ lat: 24.8, lng: 67.0 });
  });
  it('null when neither is set', () => {
    expect(resolveStopPoint({ lat: 0, long: 0 }, { homeLat: 0, homeLng: 0 })).toBeNull();
    expect(resolveStopPoint(undefined, null)).toBeNull();
  });
  it('validates points', () => {
    expect(isValidPoint(24.8, 67)).toBe(true);
    expect(isValidPoint(0, 0)).toBe(false);
    expect(isValidPoint(100, 0)).toBe(false);
    expect(isValidPoint('1', 2)).toBe(false);
  });
});
