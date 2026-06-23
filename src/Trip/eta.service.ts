/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { Client, TravelMode } from '@googlemaps/google-maps-services-js';

const GOOGLE_API_KEY = 'AIzaSyAWyTey_qT1z2OyjAr0gH3eIGUGYQWpipo';

export interface ETAResult {
  destinationName: string;
  distanceText: string;
  distanceMeters: number;
  durationText: string;
  durationSeconds: number;
  etaTime: string;
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
        const etaDate = new Date(Date.now() + durationSec * 1000);
        const hours = etaDate.getHours().toString().padStart(2, '0');
        const mins = etaDate.getMinutes().toString().padStart(2, '0');
        return {
          destinationName: dest.name,
          distanceText: el?.distance?.text || 'N/A',
          distanceMeters: el?.distance?.value || 0,
          durationText: el?.duration?.text || 'N/A',
          durationSeconds: durationSec,
          etaTime: hours + ':' + mins,
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
}
