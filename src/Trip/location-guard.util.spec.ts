import {
  evaluatePoint, impliedSpeedKmh, readTrackingMeta, sessionAllows,
  MAX_ACCURACY_METERS, MAX_SPEED_KMH, REANCHOR_AFTER, PendingJump,
} from './location-guard.util';

const T0 = new Date('2026-10-15T14:00:00.000Z');
const at = (s: number) => new Date(T0.getTime() + s * 1000);
// ~111 m per 0.001° of latitude.
const p = (lat: number, s: number, extra: any = {}) => ({ lat, long: 67.0, time: at(s), ...extra });
const NOW = at(600);

describe('evaluatePoint', () => {
  const prev = p(24.9, 0);

  it('accepts the first point and a normal move', () => {
    expect(evaluatePoint(p(24.9, 0), null, NOW).accept).toBe(true);
    expect(evaluatePoint(p(24.9002, 2), prev, NOW).accept).toBe(true); // ~22 m in 2 s
  });

  it('rejects accuracy over 50 m, accepts exactly 50 m and unknown accuracy', () => {
    expect(evaluatePoint(p(24.9001, 2, { accuracy: MAX_ACCURACY_METERS + 1 }), prev, NOW))
      .toMatchObject({ accept: false, reason: 'accuracy' });
    expect(evaluatePoint(p(24.9001, 2, { accuracy: MAX_ACCURACY_METERS }), prev, NOW).accept).toBe(true);
    expect(evaluatePoint(p(24.9001, 2, { accuracy: undefined }), prev, NOW).accept).toBe(true);
  });

  it('rejects a time in the future, allows a little clock drift', () => {
    expect(evaluatePoint(p(24.9001, 1000), prev, NOW)).toMatchObject({ accept: false, reason: 'future' });
    expect(evaluatePoint(p(24.9001, 620), prev, NOW).accept).toBe(true); // 20 s ahead
  });

  it('rejects a time older than the last accepted point', () => {
    const later = p(24.9, 100);
    expect(evaluatePoint(p(24.9001, 50), later, NOW)).toMatchObject({ accept: false, reason: 'stale' });
    expect(evaluatePoint(p(24.9001, 100), later, NOW).accept).toBe(true); // same instant is fine
  });

  it('rejects an implied speed over 150 km/h', () => {
    // 0.02° ≈ 2.2 km in 10 s ≈ 800 km/h
    const v = evaluatePoint(p(24.92, 10), prev, NOW);
    expect(v).toMatchObject({ accept: false, reason: 'speed' });
    expect(v.pending).toMatchObject({ count: 1 });
    // 120 km/h is fine: 333 m in 10 s
    expect(impliedSpeedKmh(prev, p(24.903, 10))).toBeLessThan(MAX_SPEED_KMH);
    expect(evaluatePoint(p(24.903, 10), prev, NOW).accept).toBe(true);
  });

  it('two interleaved sources: the one that follows the last accepted point wins, the other is dropped', () => {
    let last = p(24.9, 0); // fixed source A
    let pending: PendingJump | null = null;
    const kept: number[] = [];
    for (let i = 1; i <= 8; i++) {
      const a = evaluatePoint(p(24.9, i * 2), last, NOW, pending); // A again
      if (a.accept) { last = p(24.9, i * 2); kept.push(24.9); }
      pending = a.pending;
      const b = evaluatePoint(p(24.95 + i * 0.0002, i * 2 + 1), last, NOW, pending); // moving source B
      expect(b.accept).toBe(false);
      pending = b.pending;
    }
    expect(kept.length).toBe(8);
  });

  it('five agreeing fixes after a bad anchor re-anchor the trail', () => {
    const bad = p(24.9, 0); // glitch the trail was anchored on
    let pending: PendingJump | null = null;
    let verdict;
    for (let i = 1; i <= REANCHOR_AFTER; i++) {
      verdict = evaluatePoint(p(24.95 + i * 0.0001, 10 + i * 2), bad, NOW, pending);
      pending = verdict.pending;
      if (i < REANCHOR_AFTER) expect(verdict.accept).toBe(false);
    }
    expect(verdict).toMatchObject({ accept: true, reanchored: true, pending: null });
  });

  it('a rejected point that does not continue the pending one restarts the count', () => {
    const pending: PendingJump = { ...p(24.95, 10), count: 3 };
    const v = evaluatePoint(p(25.2, 12), prev, NOW, pending); // somewhere else entirely
    expect(v.pending?.count).toBe(1);
  });
});

describe('sessionAllows', () => {
  it('no session id on the request (old app): always allowed', () => {
    expect(sessionAllows({ sessionId: 'A' }, undefined)).toBe(true);
    expect(sessionAllows({ sessionId: 'A' }, '')).toBe(true);
  });
  it('trip without a claimed session: allowed', () => {
    expect(sessionAllows(undefined, 'A')).toBe(true);
    expect(sessionAllows({}, 'A')).toBe(true);
  });
  it('same session allowed, a different one is replaced', () => {
    expect(sessionAllows({ sessionId: 'A' }, 'A')).toBe(true);
    expect(sessionAllows({ sessionId: 'B' }, 'A')).toBe(false);
  });
});

describe('readTrackingMeta', () => {
  it('uses the phone time when valid, else the server time', () => {
    const now = at(5);
    expect(readTrackingMeta({ time: at(1).toISOString() }, now).time).toEqual(at(1));
    expect(readTrackingMeta({ time: 'garbage' }, now).time).toEqual(now);
    expect(readTrackingMeta({}, now).time).toEqual(now);
  });
  it('reads ids and accuracy, ignores junk', () => {
    expect(readTrackingMeta({ sessionId: ' s1 ', deviceId: 'd1', accuracy: 12.5 }))
      .toMatchObject({ sessionId: 's1', deviceId: 'd1', accuracy: 12.5 });
    expect(readTrackingMeta({ sessionId: 5, accuracy: -1 })).toMatchObject({ sessionId: undefined, accuracy: undefined });
  });
});

import { decideLocationWrite, TRACKING_SESSION_REPLACED } from './location-guard.util';

describe('decideLocationWrite', () => {
  const trip = (extra: any = {}) => ({
    trackingSession: { sessionId: 'A' },
    locations: [{ lat: 24.9, long: 67.0, time: at(0) }],
    pendingJump: null,
    ...extra,
  });
  const fix = (lat: number, s: number, extra: any = {}) => ({ lat, long: 67.0, time: at(s), ...extra });

  it('session takeover: the old session is replaced, the new one writes', () => {
    expect(TRACKING_SESSION_REPLACED).toBe('TRACKING_SESSION_REPLACED');
    expect(decideLocationWrite(trip({ trackingSession: { sessionId: 'B' } }), fix(24.9001, 2), 'A', NOW)).toEqual({ action: 'replaced' });
    expect(decideLocationWrite(trip({ trackingSession: { sessionId: 'B' } }), fix(24.9001, 2), 'B', NOW).action).toBe('accept');
  });

  it('no sessionId (old app) is still accepted, and the filters still apply to it', () => {
    expect(decideLocationWrite(trip(), fix(24.9001, 2), undefined, NOW).action).toBe('accept');
    expect(decideLocationWrite(trip(), fix(24.9001, 2, { accuracy: 80 }), undefined, NOW))
      .toMatchObject({ action: 'reject', reason: 'accuracy' });
    expect(decideLocationWrite(trip(), fix(24.95, 5), undefined, NOW))
      .toMatchObject({ action: 'reject', reason: 'speed' });
  });

  it('a trip nobody claimed accepts any session id', () => {
    expect(decideLocationWrite(trip({ trackingSession: null }), fix(24.9001, 2), 'whatever', NOW).action).toBe('accept');
  });

  it('first point of a trip with no locations is accepted', () => {
    expect(decideLocationWrite(trip({ locations: [] }), fix(24.9, 0), 'A', NOW).action).toBe('accept');
  });

  it('a stored point without a time does not block the next one', () => {
    expect(decideLocationWrite(trip({ locations: [{ lat: 24.9, long: 67.0 }] }), fix(24.9001, 2), 'A', NOW).action).toBe('accept');
  });

  it('clears the pending jump on accept, keeps counting on reject', () => {
    const pend = { lat: 24.95, long: 67.0, time: at(3), count: 2 };
    expect(decideLocationWrite(trip({ pendingJump: pend }), fix(24.9001, 4), 'A', NOW)).toMatchObject({ action: 'accept', pending: null });
    const r: any = decideLocationWrite(trip({ pendingJump: pend }), fix(24.9502, 5), 'A', NOW);
    expect(r.action).toBe('reject');
    expect(r.pending.count).toBe(3);
  });
});
