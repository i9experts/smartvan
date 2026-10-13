import { isMoving, nextTrafficState, trafficStopSeconds } from './traffic-delay.util';

const t = (s: number) => new Date(Date.UTC(2026, 9, 12, 8, 0, s));

describe('traffic delay', () => {
  it('moving detection', () => {
    expect(isMoving(30, null)).toBe(true);
    expect(isMoving(2, 100)).toBe(false); // speed wins
    expect(isMoving(null, 5)).toBe(false);
    expect(isMoving(null, 40)).toBe(true);
    expect(isMoving(null, null)).toBe(true);
  });

  it('alerts after 2 minutes stopped away from stops, once', () => {
    let s = nextTrafficState({}, t(0), false, false, 120);
    expect(s.alert).toBe(false);
    s = nextTrafficState({ stoppedSince: s.stoppedSince }, t(119), false, false, 120);
    expect(s.alert).toBe(false);
    s = nextTrafficState({ stoppedSince: s.stoppedSince }, t(120), false, false, 120);
    expect(s.alert).toBe(true);
    // cooldown: same stop keeps going, no second alert
    s = nextTrafficState({ stoppedSince: s.stoppedSince, trafficAlertAt: t(120) }, t(300), false, false, 120);
    expect(s.alert).toBe(false);
  });

  it('never alerts at a stop, and resets when moving', () => {
    expect(nextTrafficState({ stoppedSince: t(0) }, t(500), false, true, 120).alert).toBe(false);
    expect(nextTrafficState({ stoppedSince: t(0) }, t(500), true, false, 120)).toEqual({
      stoppedSince: null, alert: false, stoppedSeconds: 0,
    });
  });

  it('configurable threshold', () => {
    expect(trafficStopSeconds(undefined)).toBe(120);
    expect(trafficStopSeconds('90')).toBe(90);
    expect(trafficStopSeconds('5')).toBe(120);
  });
});
