import { decideScanAction } from './scan-action.util';

describe('decideScanAction', () => {
  it('picks a kid not yet on the trip', () => {
    expect(decideScanAction('pick', 'a', [])).toBe('pick');
    expect(decideScanAction('drop', 'a', [{ kidId: 'b', status: 'picked' }])).toBe('pickFromSchool');
  });

  it('drops a picked kid on a drop trip', () => {
    expect(decideScanAction('drop', 'a', [{ kidId: 'a', status: 'picked' }])).toBe('drop');
  });

  it('refuses a second scan on a pick trip (school drop = End Trip)', () => {
    expect(decideScanAction('pick', 'a', [{ kidId: 'a', status: 'picked' }])).toBe('alreadyPicked');
  });

  it('refuses a kid already dropped, even with duplicate entries', () => {
    expect(
      decideScanAction('drop', 'a', [
        { kidId: 'a', status: 'picked' },
        { kidId: 'a', status: 'dropped' },
      ]),
    ).toBe('alreadyDropped');
  });
});
