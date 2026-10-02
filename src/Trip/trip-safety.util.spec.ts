import { findUndroppedKidIds, requiresDropConfirmation } from './trip-safety.util';

describe('findUndroppedKidIds', () => {
  it('returns kids that are picked but not dropped', () => {
    expect(
      findUndroppedKidIds([
        { kidId: 'a', status: 'picked' },
        { kidId: 'b', status: 'dropped' },
        { kidId: 'c', status: 'picked' },
      ]),
    ).toEqual(['a', 'c']);
  });

  it('treats a kid as dropped if any duplicate entry is dropped', () => {
    expect(
      findUndroppedKidIds([
        { kidId: 'a', status: 'dropped' },
        { kidId: 'a', status: 'picked' },
      ]),
    ).toEqual([]);
  });

  it('returns unique ids', () => {
    expect(
      findUndroppedKidIds([
        { kidId: 'a', status: 'picked' },
        { kidId: 'a', status: 'picked' },
      ]),
    ).toEqual(['a']);
  });

  it('handles empty / missing input', () => {
    expect(findUndroppedKidIds([])).toEqual([]);
    expect(findUndroppedKidIds(undefined)).toEqual([]);
  });
});

describe('requiresDropConfirmation', () => {
  it('only applies to drop trips', () => {
    expect(requiresDropConfirmation('drop')).toBe(true);
    expect(requiresDropConfirmation('pick')).toBe(false);
    expect(requiresDropConfirmation(undefined)).toBe(false);
  });
});
