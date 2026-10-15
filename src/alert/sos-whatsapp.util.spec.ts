/* eslint-disable prettier/prettier */
import { collectRecipients, isThrottled, maskPhone, sosTemplateParams, sosWhatsappEnabled, toE164 } from './sos-whatsapp.util';

describe('toE164', () => {
  it.each([
    ['03002147180', '+923002147180'], ['+923002147180', '+923002147180'], ['92 300-2147180', '+923002147180'],
    ['3002147180', '+923002147180'], ['00923002147180', '+923002147180'], ['+971501234567', '+971501234567'],
  ])('%s → %s', (raw, out) => expect(toE164(raw)).toBe(out));
  it.each(['', null, 'abc', '12345', '0211234567'])('rejects %p', (raw) => expect(toE164(raw as any)).toBeNull());
});

describe('collectRecipients', () => {
  it('normalizes, dedupes by number (merging child names), and reports invalid ones', () => {
    const { recipients, invalid } = collectRecipients([
      { _id: 'p1', phoneNo: '0300-2147180', kidNames: ['Fatima'] },
      { _id: 'p2', phoneNo: '+923002147180', kidNames: ['Ali'] }, // same number as p1
      { _id: 'p3', phoneNo: '03111234567', kidNames: ['Sara'] },
      { _id: 'p4', phoneNo: 'n/a', kidNames: ['X'] },
      { _id: 'p5' },
    ]);
    expect(recipients).toEqual([
      { parentId: 'p1', phone: '+923002147180', childNames: 'Fatima, Ali' },
      { parentId: 'p3', phone: '+923111234567', childNames: 'Sara' },
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
  it('flag is on by default, off only for false/0/off/no', () => {
    expect(sosWhatsappEnabled(undefined)).toBe(true);
    expect(sosWhatsappEnabled('')).toBe(true);
    expect(sosWhatsappEnabled('true')).toBe(true);
    expect(sosWhatsappEnabled('false')).toBe(false);
    expect(sosWhatsappEnabled('FALSE')).toBe(false);
    expect(sosWhatsappEnabled('0')).toBe(false);
  });
  it('body params match the approved smartvan_sos template (child, van, contact)', () => {
    expect(sosTemplateParams({ childNames: 'Fatima', vanNumber: 'BHJ-616', contactNumber: '+923002517280' }))
      .toEqual(['Fatima', 'BHJ-616', '+923002517280']);
  });
  it('masks phone', () => expect(maskPhone('+923002147180')).toBe('+92300***7180'));
});
