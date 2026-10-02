import { buildQrPayload, generateQrToken, parseQrPayload, QR_PREFIX } from './kid-qr.util';

describe('kid QR utils', () => {
  it('generates unique 24-char url-safe tokens', () => {
    const a = generateQrToken();
    const b = generateQrToken();
    expect(a).toHaveLength(24);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toEqual(b);
  });

  it('round-trips payload → token', () => {
    const t = generateQrToken();
    expect(buildQrPayload(t)).toBe(QR_PREFIX + t);
    expect(parseQrPayload(buildQrPayload(t))).toBe(t);
  });

  it('accepts a bare token and trims whitespace', () => {
    const t = generateQrToken();
    expect(parseQrPayload(`  ${t}\n`)).toBe(t);
  });

  it('rejects anything else', () => {
    expect(parseQrPayload('https://example.com')).toBeNull();
    expect(parseQrPayload('smartvan:kid:short')).toBeNull();
    expect(parseQrPayload('')).toBeNull();
    expect(parseQrPayload(undefined)).toBeNull();
    expect(parseQrPayload(12345)).toBeNull();
  });
});
