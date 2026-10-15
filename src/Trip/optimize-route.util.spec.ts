import {
  MAX_OPTIMIZED_WAYPOINTS,
  mergeStopOrder,
  planOptimization,
  remainingKidIds,
  stopStateOf,
} from './optimize-route.util';

const pt = (lat: number, lng: number) => ({ lat, lng });

describe('stopStateOf', () => {
  const none = new Set<string>();
  it('dropped wins over picked, then no-show, then absent, else waiting', () => {
    const entries = [
      { kidId: 'a', status: 'picked' },
      { kidId: 'a', status: 'dropped' },
      { kidId: 'b', status: 'picked' },
    ];
    expect(stopStateOf(entries, 'a', none, none)).toBe('dropped');
    expect(stopStateOf(entries, 'b', none, none)).toBe('picked');
    expect(stopStateOf([], 'c', new Set(['c']), new Set(['c']))).toBe('no_show');
    expect(stopStateOf([], 'c', none, new Set(['c']))).toBe('absent');
    expect(stopStateOf([], 'c', none, none)).toBe('waiting');
  });
});

describe('remainingKidIds', () => {
  const states: Record<string, any> = { a: 'picked', b: 'waiting', c: 'absent', d: 'no_show', e: 'dropped', f: 'waiting' };
  const stateOf = (id: string) => states[id];
  const order = ['a', 'b', 'c', 'd', 'e', 'f'];
  it('pick trip: only kids still waiting', () => {
    expect(remainingKidIds('pick', order, stateOf)).toEqual(['b', 'f']);
  });
  it('drop trip: only kids still in the van', () => {
    expect(remainingKidIds('drop', order, stateOf)).toEqual(['a']);
  });
});

describe('planOptimization', () => {
  const points = new Map([
    ['a', pt(24.90, 67.10)],
    ['b', pt(24.88, 67.05)],
    ['c', pt(24.95, 67.20)],
  ]);
  const origin = pt(24.92, 67.12);
  const school = pt(24.86, 67.0);

  it('pick trip ends at the school and reorders every remaining stop', () => {
    const plan = planOptimization({ type: 'pick', remaining: ['a', 'b', 'c'], points, school, origin })!;
    expect(plan.destination).toEqual(school);
    expect(plan.destinationKidId).toBeNull();
    expect(plan.waypointKidIds).toEqual(['a', 'b', 'c']);
  });

  it('pick trip without a school ends at the furthest stop', () => {
    const plan = planOptimization({ type: 'pick', remaining: ['a', 'b', 'c'], points, school: null, origin })!;
    expect(plan.destinationKidId).toBe('c'); // furthest from the van
    expect(plan.waypointKidIds).toEqual(['a', 'b']);
  });

  it('drop trip ends at the stop furthest from the van', () => {
    const plan = planOptimization({ type: 'drop', remaining: ['a', 'b', 'c'], points, school, origin: school })!;
    expect(plan.destinationKidId).toBe('c');
    expect(plan.destination).toEqual(points.get('c'));
    expect(plan.waypointKidIds).toEqual(['a', 'b']);
  });

  it('stops without a location are left out; nothing left is null', () => {
    const plan = planOptimization({ type: 'pick', remaining: ['a', 'x'], points, school, origin })!;
    expect(plan.waypointKidIds).toEqual(['a']);
    expect(planOptimization({ type: 'pick', remaining: ['x'], points, school, origin })).toBeNull();
    expect(planOptimization({ type: 'pick', remaining: [], points, school, origin })).toBeNull();
  });

  it('stops beyond the waypoint limit are kept as they are', () => {
    const many = new Map<string, any>();
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) { ids.push(`k${i}`); many.set(`k${i}`, pt(24.8 + i * 0.001, 67.0)); }
    const plan = planOptimization({ type: 'pick', remaining: ids, points: many, school, origin })!;
    expect(plan.waypointKidIds).toHaveLength(MAX_OPTIMIZED_WAYPOINTS);
    expect(plan.untouchedKidIds).toEqual(ids.slice(MAX_OPTIMIZED_WAYPOINTS));
  });
});

describe('mergeStopOrder', () => {
  it('done stops keep their place; optimized ones follow', () => {
    const order = mergeStopOrder(
      ['a', 'b', 'c', 'd', 'e'],
      ['c', 'd', 'e'],
      ['e', 'c'],
      { destinationKidId: 'd', untouchedKidIds: [] },
    );
    expect(order).toEqual(['a', 'b', 'e', 'c', 'd']);
  });
  it('keeps untouched stops last', () => {
    expect(
      mergeStopOrder(['a', 'b', 'c'], ['a', 'b', 'c'], ['b', 'a'], { destinationKidId: null, untouchedKidIds: ['c'] }),
    ).toEqual(['b', 'a', 'c']);
  });
});
