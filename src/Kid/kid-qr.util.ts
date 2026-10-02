/* eslint-disable prettier/prettier */
import { randomBytes } from 'crypto';

export const QR_PREFIX = 'smartvan:kid:';
const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

/** 24-char URL-safe random token (144 bits). */
export function generateQrToken(): string {
  return randomBytes(18).toString('base64url');
}

export function buildQrPayload(token: string): string {
  return `${QR_PREFIX}${token}`;
}

/**
 * Accepts the full payload printed on the card ("smartvan:kid:<token>") or
 * a bare token. Returns the token, or null if it isn't a SmartVan kid QR.
 */
export function parseQrPayload(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  const token = value.startsWith(QR_PREFIX) ? value.slice(QR_PREFIX.length) : value;
  return TOKEN_RE.test(token) ? token : null;
}
