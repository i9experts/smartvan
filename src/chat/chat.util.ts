/* eslint-disable prettier/prettier */

export type ChatRole = 'parent' | 'driver';

export function chatRoleOf(user: any): ChatRole | null {
  return user?.userType === 'parent' || user?.userType === 'driver' ? user.userType : null;
}

/** Trims and validates message text. Returns null if unusable. */
export function cleanMessageText(raw: unknown, max = 1000): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/\s+\n/g, '\n').trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}

/** Socket room each user joins on connect, for chat and personal events. */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function clampLimit(raw: unknown, def = 30, max = 100): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : def;
}
