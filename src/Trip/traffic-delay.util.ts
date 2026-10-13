/* eslint-disable prettier/prettier */

/** How long the van must be stopped (away from any stop) before alerting. */
export function trafficStopSeconds(raw: string | undefined = process.env.TRAFFIC_STOP_SECONDS): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 30 ? n : 120;
}

/** Minimum time between two traffic alerts for the same trip. */
export const TRAFFIC_ALERT_COOLDOWN_MS = 10 * 60 * 1000;

/** Is the van moving? Uses GPS speed when present, else distance since the last point. */
export function isMoving(speedKmh: number | null, segmentMeters: number | null): boolean {
  if (speedKmh !== null) return speedKmh >= 5;
  if (segmentMeters !== null) return segmentMeters >= 15;
  return true; // unknown → don't raise false alarms
}

export interface TrafficState {
  stoppedSince?: Date | null;
  trafficAlertAt?: Date | null;
}

/**
 * Next stopped/alert state. Returns `alert: true` exactly when a traffic
 * alert should be sent now.
 */
export function nextTrafficState(
  prev: TrafficState,
  now: Date,
  moving: boolean,
  nearStop: boolean,
  stopSeconds = trafficStopSeconds(),
): { stoppedSince: Date | null; alert: boolean; stoppedSeconds: number } {
  if (moving) return { stoppedSince: null, alert: false, stoppedSeconds: 0 };
  const since = prev.stoppedSince ? new Date(prev.stoppedSince) : now;
  const stoppedSeconds = Math.round((now.getTime() - since.getTime()) / 1000);
  const cooledDown = !prev.trafficAlertAt || now.getTime() - new Date(prev.trafficAlertAt).getTime() > TRAFFIC_ALERT_COOLDOWN_MS;
  // A stop to pick up / drop a child, or at school, is not traffic.
  const alert = !nearStop && stoppedSeconds >= stopSeconds && cooledDown;
  return { stoppedSince: since, alert, stoppedSeconds };
}
