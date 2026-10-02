import { etaPushToSend, overspeedLimitKmh, speedKmh, waitingKidIds } from './location-pipeline.util';

describe('waitingKidIds', () => {
  const route = ['a', 'b', 'c'];
  it('pick trip: route kids not yet picked', () => {
    expect(waitingKidIds('pick', route, [{ kidId: 'a', status: 'picked' }])).toEqual(['b', 'c']);
  });
  it('drop trip: kids in the van', () => {
    expect(
      waitingKidIds('drop', route, [
        { kidId: 'a', status: 'picked' },
        { kidId: 'b', status: 'dropped' },
        { kidId: 'c', status: 'picked' },
        { kidId: 'c', status: 'dropped' },
      ]),
    ).toEqual(['a']);
  });
});

describe('etaPushToSend', () => {
  it('sends 10-minute push once', () => {
    expect(etaPushToSend('k', 9)).toEqual({ threshold: 10, markSent: ['k:10'] });
    expect(etaPushToSend('k', 8, ['k:10'])).toBeNull();
  });
  it('sends only the 3-minute push when both crossed at once', () => {
    expect(etaPushToSend('k', 2)).toEqual({ threshold: 3, markSent: ['k:10', 'k:3'] });
  });
  it('sends 3-minute after 10-minute', () => {
    expect(etaPushToSend('k', 3, ['k:10'])).toEqual({ threshold: 3, markSent: ['k:10', 'k:3'] });
  });
  it('ignores far away or invalid', () => {
    expect(etaPushToSend('k', 25)).toBeNull();
    expect(etaPushToSend('k', 0)).toBeNull();
    expect(etaPushToSend('k', NaN)).toBeNull();
  });
});

describe('speed helpers', () => {
  it('converts m/s to km/h and rejects junk', () => {
    expect(speedKmh(10)).toBe(36);
    expect(speedKmh(-1)).toBeNull();
    expect(speedKmh(100)).toBeNull();
    expect(speedKmh('5')).toBeNull();
  });
  it('limit defaults to 60', () => {
    expect(overspeedLimitKmh(undefined)).toBe(60);
    expect(overspeedLimitKmh('80')).toBe(80);
    expect(overspeedLimitKmh('x')).toBe(60);
  });
});
