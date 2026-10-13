import { decodePolyline, downsample, encodePolyline, joinStepPolylines } from './polyline.util';

describe('polyline utils', () => {
  it('decodes the Google reference example', () => {
    // From Google's polyline algorithm docs.
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });

  it('round-trips', () => {
    const pts: [number, number][] = [[24.86077, 67.00113], [24.86201, 67.0025], [24.85999, 66.99887]];
    expect(decodePolyline(encodePolyline(pts))).toEqual(pts);
  });

  it('joins steps without duplicate joints', () => {
    const a = encodePolyline([[1, 1], [2, 2]]);
    const b = encodePolyline([[2, 2], [3, 3]]);
    expect(joinStepPolylines([a, b])).toEqual([[1, 1], [2, 2], [3, 3]]);
  });

  it('downsamples keeping ends', () => {
    const pts = Array.from({ length: 101 }, (_, i) => i);
    const d = downsample(pts, 11);
    expect(d).toHaveLength(11);
    expect(d[0]).toBe(0);
    expect(d[10]).toBe(100);
    expect(downsample([1, 2], 5)).toEqual([1, 2]);
  });
});
