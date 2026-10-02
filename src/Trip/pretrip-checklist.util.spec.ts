import {
  checklistDate,
  checklistItemDefs,
  DEFAULT_CHECKLIST_ITEMS,
  isChecklistRequired,
  validateChecklistItems,
} from './pretrip-checklist.util';

const defs = [
  { key: 'tyres', label: 'Tyres' },
  { key: 'fuel', label: 'Fuel' },
];

describe('checklist utils', () => {
  it('uses defaults when env is empty or invalid', () => {
    expect(checklistItemDefs(undefined)).toBe(DEFAULT_CHECKLIST_ITEMS);
    expect(checklistItemDefs('not json')).toBe(DEFAULT_CHECKLIST_ITEMS);
    expect(checklistItemDefs('[{"key":1}]')).toBe(DEFAULT_CHECKLIST_ITEMS);
  });

  it('reads items from env JSON', () => {
    expect(checklistItemDefs('[{"key":"a","label":"A"}]')).toEqual([{ key: 'a', label: 'A' }]);
  });

  it('isChecklistRequired is opt-in', () => {
    expect(isChecklistRequired(undefined)).toBe(false);
    expect(isChecklistRequired('false')).toBe(false);
    expect(isChecklistRequired('TRUE')).toBe(true);
  });

  it('formats the date in the given timezone', () => {
    // 2026-10-01 20:30 UTC = 2026-10-02 01:30 in Karachi (UTC+5)
    expect(checklistDate('Asia/Karachi', new Date('2026-10-01T20:30:00Z'))).toBe('2026-10-02');
  });

  it('validates items', () => {
    expect(validateChecklistItems([{ key: 'tyres', ok: true }, { key: 'fuel', ok: false }], defs)).toBeNull();
    expect(validateChecklistItems([], defs)).toMatch(/required/);
    expect(validateChecklistItems([{ key: 'tyres', ok: true }], defs)).toMatch(/missing items: fuel/);
    expect(validateChecklistItems([{ key: 'x', ok: true }], defs)).toMatch(/unknown/);
    expect(
      validateChecklistItems([{ key: 'tyres', ok: true }, { key: 'tyres', ok: true }], defs),
    ).toMatch(/duplicate/);
    expect(validateChecklistItems([{ key: 'tyres', ok: 'yes' }], defs)).toMatch(/boolean/);
  });
});
