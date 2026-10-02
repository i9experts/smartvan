import { Cooldown } from './sos-rate-limit';

describe('Cooldown', () => {
  it('allows the first hit and blocks within the window', () => {
    const c = new Cooldown(30_000);
    expect(c.hit('d1', 0)).toBe(0);
    expect(c.hit('d1', 10_000)).toBe(20);
  });

  it('allows again after the window and is per key', () => {
    const c = new Cooldown(30_000);
    expect(c.hit('d1', 0)).toBe(0);
    expect(c.hit('d2', 1_000)).toBe(0);
    expect(c.hit('d1', 30_000)).toBe(0);
  });
});
