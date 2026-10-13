/* eslint-disable prettier/prettier */
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Client, TravelMode } from '@googlemaps/google-maps-services-js';
import { joinStepPolylines } from './polyline.util';
import * as moment from 'moment-timezone';

const ETA_TZ = process.env.DEFAULT_TIMEZONE || 'Asia/Karachi';

// Server-side key for the Distance Matrix API. Use a separate key from the
// mobile apps, restricted by server IP + Distance Matrix API only.
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
if (!GOOGLE_API_KEY) {
  console.warn('[EtaService] GOOGLE_MAPS_API_KEY is not set — ETA calculation will fail.');
}

export interface ETAResult {
  destinationName: string;
  distanceText: string;
  distanceMeters: number;
  durationText: string;
  durationSeconds: number;
  etaTime: string;
}

export interface RouteOptimizationResult {
  // Indices into the `waypoints` array passed in, in the order the
  // optimized route visits them.
  optimizedOrder: number[];
  optimizedDistanceMeters: number;
  optimizedDurationSeconds: number;
  // Same waypoints, visited in the order they were given (the admin's
  // originally-entered stop order) — the baseline to compare against.
  baselineDistanceMeters: number;
  baselineDurationSeconds: number;
  overviewPolyline: string;
}

@Injectable()
export class EtaService {
  private client = new Client({});

  async calculateETA(
    originLat: number,
    originLng: number,
    destinations: { name: string; lat: number; lng: number }[],
  ): Promise<ETAResult[]> {
    if (!destinations.length) return [];
    try {
      const response = await this.client.distancematrix({
        params: {
          origins: [originLat + ',' + originLng],
          destinations: destinations.map(d => d.lat + ',' + d.lng),
          mode: TravelMode.driving,
          key: GOOGLE_API_KEY,
        },
      });
      const elements = response.data.rows[0]?.elements || [];
      return destinations.map((dest, i) => {
        const el = elements[i];
        const durationSec = el?.duration?.value || 0;
        // Local (school) time, 12-hour — the server runs in UTC, so
        // getHours() showed parents e.g. "08:23" for 1:23 PM in Karachi.
        const etaTime = moment().tz(ETA_TZ).add(durationSec, 'seconds').format('h:mm A');
        return {
          destinationName: dest.name,
          distanceText: el?.distance?.text || 'N/A',
          distanceMeters: el?.distance?.value || 0,
          durationText: el?.duration?.text || 'N/A',
          durationSeconds: durationSec,
          etaTime,
        };
      });
    } catch (err) {
      console.error('ETA calculation failed:', err.message);
      return destinations.map(dest => ({
        destinationName: dest.name,
        distanceText: 'N/A',
        distanceMeters: 0,
        durationText: 'N/A',
        durationSeconds: 0,
        etaTime: 'N/A',
      }));
    }
  }

  // Two Directions API calls: one with the stops in the order the admin
  // originally entered them (the baseline), one with optimize:true (lets
  // Google reorder the intermediate stops for the shortest route — origin
  // and destination stay fixed). Comparing the two gives a real, honest
  // distance/time saved instead of a guess.
  async getOptimizedRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    waypoints: { lat: number; lng: number }[],
  ): Promise<RouteOptimizationResult> {
    if (!GOOGLE_API_KEY) {
      throw new ServiceUnavailableException('Route optimization is not configured on the server.');
    }

    const waypointParams = waypoints.map((w) => `${w.lat},${w.lng}`);

    try {
      const [baselineRes, optimizedRes] = await Promise.all([
        this.client.directions({
          params: {
            origin: `${origin.lat},${origin.lng}`,
            destination: `${destination.lat},${destination.lng}`,
            waypoints: waypointParams,
            mode: TravelMode.driving,
            key: GOOGLE_API_KEY,
          },
        }),
        this.client.directions({
          params: {
            origin: `${origin.lat},${origin.lng}`,
            destination: `${destination.lat},${destination.lng}`,
            waypoints: waypointParams,
            optimize: true,
            mode: TravelMode.driving,
            key: GOOGLE_API_KEY,
          },
        }),
      ]);

      const baselineRoute = baselineRes.data.routes[0];
      const optimizedRoute = optimizedRes.data.routes[0];
      if (!baselineRoute || !optimizedRoute) {
        throw new ServiceUnavailableException('Could not calculate a route for these stops.');
      }

      const sumLegs = (legs: { distance?: { value: number }; duration?: { value: number } }[]) =>
        legs.reduce(
          (acc, leg) => ({
            distance: acc.distance + (leg.distance?.value || 0),
            duration: acc.duration + (leg.duration?.value || 0),
          }),
          { distance: 0, duration: 0 },
        );

      const baselineTotals = sumLegs(baselineRoute.legs);
      const optimizedTotals = sumLegs(optimizedRoute.legs);

      // waypoint_order is empty when there's only one waypoint (nothing to
      // reorder) — Google still returns it correctly for 2+.
      const optimizedOrder = optimizedRoute.waypoint_order.length
        ? optimizedRoute.waypoint_order
        : waypoints.map((_, i) => i);

      return {
        optimizedOrder,
        optimizedDistanceMeters: optimizedTotals.distance,
        optimizedDurationSeconds: optimizedTotals.duration,
        baselineDistanceMeters: baselineTotals.distance,
        baselineDurationSeconds: baselineTotals.duration,
        overviewPolyline: optimizedRoute.overview_polyline?.points || '',
      };
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      console.error('Route optimization failed:', err?.message || err);
      throw new ServiceUnavailableException('Could not optimize this route right now.');
    }
  }

  /**
   * Road-following path origin → waypoints (in the given order) → destination.
   * Points come from every step's polyline (not the simplified overview), so
   * the line follows each road and turn. Legs give per-stop ETAs.
   */
  async getRoutePath(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    waypoints: { lat: number; lng: number }[],
  ): Promise<{ points: [number, number][]; legs: { distanceMeters: number; durationSeconds: number }[] }> {
    if (!GOOGLE_API_KEY) {
      throw new ServiceUnavailableException('Route planning is not configured on the server.');
    }
    try {
      const res = await this.client.directions({
        params: {
          origin: `${origin.lat},${origin.lng}`,
          destination: `${destination.lat},${destination.lng}`,
          waypoints: waypoints.slice(0, 23).map((w) => `${w.lat},${w.lng}`),
          mode: TravelMode.driving,
          key: GOOGLE_API_KEY,
        },
      });
      const route = res.data.routes[0];
      if (!route) throw new ServiceUnavailableException('No route found for these stops.');
      const steps: string[] = [];
      for (const leg of route.legs) for (const step of leg.steps) if (step.polyline?.points) steps.push(step.polyline.points);
      return {
        points: joinStepPolylines(steps),
        legs: route.legs.map((l) => ({ distanceMeters: l.distance?.value || 0, durationSeconds: l.duration?.value || 0 })),
      };
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      console.error('Route path failed:', err?.message || err);
      throw new ServiceUnavailableException('Could not load the route right now.');
    }
  }
}
