import { chatRoleOf, clampLimit, cleanMessageText, userRoom } from './chat.util';

describe('chat utils', () => {
  it('role from token', () => {
    expect(chatRoleOf({ userType: 'parent' })).toBe('parent');
    expect(chatRoleOf({ userType: 'driver' })).toBe('driver');
    expect(chatRoleOf({ role: 'admin' })).toBeNull();
  });
  it('cleans text', () => {
    expect(cleanMessageText('  hi  ')).toBe('hi');
    expect(cleanMessageText('   ')).toBeNull();
    expect(cleanMessageText(5)).toBeNull();
    expect(cleanMessageText('x'.repeat(1200))).toHaveLength(1000);
  });
  it('rooms and limits', () => {
    expect(userRoom('u1')).toBe('user:u1');
    expect(clampLimit(undefined)).toBe(30);
    expect(clampLimit('500')).toBe(100);
    expect(clampLimit('-3')).toBe(30);
  });
});
