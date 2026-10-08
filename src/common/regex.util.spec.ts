import { containsRegex, escapeRegex } from './regex.util';

describe('regex utils', () => {
  it('escapes special characters', () => {
    expect(escapeRegex('a(b)*.c')).toBe('a\\(b\\)\\*\\.c');
    expect(() => new RegExp(escapeRegex('a(b'))).not.toThrow();
  });
  it('builds a trimmed case-insensitive contains regex', () => {
    expect(containsRegex('  Ali  ')).toEqual({ $regex: 'Ali', $options: 'i' });
  });
});
