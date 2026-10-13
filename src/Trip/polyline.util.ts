/* eslint-disable prettier/prettier */

/** Google encoded polyline → [lat, lng] points. */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const which of [0, 1]) {
      let result = 0;
      let shift = 0;
      let b: number;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && index < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/** [lat, lng] points → Google encoded polyline. */
export function encodePolyline(points: [number, number][]): string {
  let out = '';
  let prevLat = 0;
  let prevLng = 0;
  const encodeValue = (v: number) => {
    let value = v < 0 ? ~(v << 1) : v << 1;
    let chunk = '';
    while (value >= 0x20) {
      chunk += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
      value >>= 5;
    }
    chunk += String.fromCharCode(value + 63);
    return chunk;
  };
  for (const [la, ln] of points) {
    const lat = Math.round(la * 1e5);
    const lng = Math.round(ln * 1e5);
    out += encodeValue(lat - prevLat) + encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

/**
 * Joins the detailed step polylines of a Directions route into one point
 * list (the overview polyline is simplified and cuts corners; the steps
 * follow every road and turn).
 */
export function joinStepPolylines(encodedSteps: string[]): [number, number][] {
  const all: [number, number][] = [];
  for (const enc of encodedSteps) {
    const pts = decodePolyline(enc);
    for (const p of pts) {
      const last = all[all.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) all.push(p);
    }
  }
  return all;
}

/** Keeps at most [max] points, evenly spaced, always keeping first and last. */
export function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max || max < 2) return points;
  const out: T[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}
