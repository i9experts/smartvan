/* eslint-disable prettier/prettier */
import { collectRecipients, isThrottled, maskPhone, pktTime, sosTemplateParams, sosWhatsappEnabled, toE164 } from './sos-whatsapp.util';

describe('toE164', () => {
  it.each([
    ['03002147180', '+923002147180'], ['+923002147180', '+923002147180'], ['92 300-2147180', '+923002147180'],
    ['3002147180', '+923002147180'], ['00923002147180', '+923002147180'], ['+971501234567', '+971501234567'],
  ])('%s → %s', (raw, out) => expect(toE164(raw)).toBe(out));
  it.each(['', null, 'abc', '12345', '0211234567'])('rejects %p', (raw) => expect(toE164(raw as any)).toBeNull());
});

describe('collectRecipients', () => {
  it('normalizes, dedupes by number, and reports invalid ones', () => {
    const { recipients, invalid } = collectRecipients([
      { _id: 'p1', phoneNo: '0300-2147180' },
      { _id: 'p2', phoneNo: '+923002147180' }, // same number as p1
      { _id: 'p3', phoneNo: '03111234567' },
      { _id: 'p4', phoneNo: 'n/a' },
      { _id: 'p5' },
    ]);
    expect(recipients).toEqual([
      { parentId: 'p1', phone: '+923002147180' },
      { parentId: 'p3', phone: '+923111234567' },
    ]);
    expect(invalid).toEqual(['p4', 'p5']);
  });
});

describe('throttle + flag + params', () => {
  const now = new Date('2026-10-15T03:42:00Z');
  it('throttles within 5 minutes only', () => {
    expect(isThrottled(new Date(now.getTime() - 4 * 60_000), now)).toBe(true);
    expect(isThrottled(new Date(now.getTime() - 5 * 60_000), now)).toBe(false);
    expect(isThrottled(null, now)).toBe(false);
  });
  it('flag is off unless "true"', () => {
    expect(sosWhatsappEnabled(undefined)).toBe(false);
    expect(sosWhatsappEnabled('false')).toBe(false);
    expect(sosWhatsappEnabled('1')).toBe(false);
    expect(sosWhatsappEnabled('TRUE')).toBe(true);
  });
  it('body params in order, time in PKT', () => {
    expect(pktTime(now, 'Asia/Karachi')).toBe('8:42 AM');
    expect(sosTemplateParams({ vanNumber: 'KHI-1', driverName: 'Ali', at: now, lat: 24.86, lng: 67.01 }))
      .toEqual(['KHI-1', 'Ali', '8:42 AM', 'https://maps.google.com/?q=24.86,67.01']);
  });
  it('masks phone', () => expect(maskPhone('+923002147180')).toBe('+92300***7180'));
});
