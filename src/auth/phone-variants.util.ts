/**
 * Login accepts a phone number typed in any common Pakistani format, while
 * the DB keeps whatever the admin typed when creating the account. So we
 * look the user up by every equivalent spelling of the same mobile number.
 *
 *   03002147180 | +923002147180 | 923002147180 | 3002147180 | 0300-2147180
 *
 * Anything that doesn't look like a Pakistani mobile (emails, CNICs, other
 * countries) is returned unchanged so existing lookups behave as before.
 */
const PK_MOBILE = /^(?:\+?92|0)?(3\d{9})$/;

export function phoneLoginVariants(identifier: string): string[] {
  const raw = (identifier ?? '').toString().trim();
  if (!raw || raw.includes('@')) return [raw];

  const compact = raw.replace(/[\s\-().]/g, '');
  const m = PK_MOBILE.exec(compact);
  if (!m) return [raw];

  const national = m[1]; // 3XXXXXXXXX
  return Array.from(
    new Set([raw, compact, `0${national}`, `+92${national}`, `92${national}`, national]),
  );
}
