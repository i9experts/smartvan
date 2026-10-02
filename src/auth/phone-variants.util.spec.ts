import { phoneLoginVariants } from './phone-variants.util';

describe('phoneLoginVariants', () => {
  const all = ['03002147180', '+923002147180', '923002147180', '3002147180'];

  it.each([
    '03002147180',
    '+923002147180',
    '923002147180',
    '3002147180',
    '0300-2147180',
    '+92 300 2147180',
  ])('expands %s to every equivalent spelling', (input) => {
    const v = phoneLoginVariants(input);
    for (const x of all) expect(v).toContain(x);
  });

  it('keeps the raw input so exactly-stored odd formats still match', () => {
    expect(phoneLoginVariants('0300-2147180')).toContain('0300-2147180');
  });

  it('leaves emails untouched', () => {
    expect(phoneLoginVariants('a@b.com')).toEqual(['a@b.com']);
  });

  it('leaves CNIC / non-mobile identifiers untouched', () => {
    expect(phoneLoginVariants('3520212345671')).toEqual(['3520212345671']);
    expect(phoneLoginVariants('0423456789')).toEqual(['0423456789']);
  });

  it('handles empty input', () => {
    expect(phoneLoginVariants('')).toEqual(['']);
  });
});
