/* eslint-disable prettier/prettier */

/**
 * Tiny in-memory per-key cooldown. Good enough for a single API instance;
 * if the API is ever scaled horizontally, move this to Redis.
 */
export class Cooldown {
  private readonly last = new Map<string, number>();

  constructor(private readonly windowMs: number) {}

  /** Returns seconds left if [key] is still cooling down, otherwise 0 and records now. */
  hit(key: string, now: number = Date.now()): number {
    const prev = this.last.get(key);
    if (prev !== undefined && now - prev < this.windowMs) {
      return Math.ceil((this.windowMs - (now - prev)) / 1000);
    }
    this.last.set(key, now);
    return 0;
  }
}
