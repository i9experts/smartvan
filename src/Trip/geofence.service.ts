/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';

export interface GeofenceZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  type: 'school' | 'home';
  kidId?: string;
  parentFcmToken?: string;
  parentId?: string;
}

export interface GeofenceEvent {
  zoneId: string;
  zoneName: string;
  zoneType: 'school' | 'home';
  event: 'entered' | 'exited';
  kidId?: string;
  parentId?: string;
  parentFcmToken?: string;
  distanceMeters: number;
}

@Injectable()
export class GeofenceService {

  getDistanceMeters(
    lat1: number, lng1: number,
    lat2: number, lng2: number,
  ): number {
    const R = 6371000;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  isInsideZone(
    vanLat: number, vanLng: number,
    zoneLat: number, zoneLng: number,
    radiusMeters: number,
  ): boolean {
    const distance = this.getDistanceMeters(vanLat, vanLng, zoneLat, zoneLng);
    return distance <= radiusMeters;
  }

  checkZones(
    vanLat: number,
    vanLng: number,
    zones: GeofenceZone[],
    previouslyInsideZoneIds: string[],
  ): {
    events: GeofenceEvent[];
    nowInsideZoneIds: string[];
  } {
    const nowInsideZoneIds: string[] = [];
    const events: GeofenceEvent[] = [];

    for (const zone of zones) {
      const distance = this.getDistanceMeters(vanLat, vanLng, zone.lat, zone.lng);
      const isInside = distance <= zone.radiusMeters;
      const wasInside = previouslyInsideZoneIds.includes(zone.id);

      if (isInside) {
        nowInsideZoneIds.push(zone.id);
        if (!wasInside) {
          events.push({
            zoneId: zone.id,
            zoneName: zone.name,
            zoneType: zone.type,
            event: 'entered',
            kidId: zone.kidId,
            parentId: zone.parentId,
            parentFcmToken: zone.parentFcmToken,
            distanceMeters: Math.round(distance),
          });
        }
      } else {
        if (wasInside) {
          events.push({
            zoneId: zone.id,
            zoneName: zone.name,
            zoneType: zone.type,
            event: 'exited',
            kidId: zone.kidId,
            parentId: zone.parentId,
            parentFcmToken: zone.parentFcmToken,
            distanceMeters: Math.round(distance),
          });
        }
      }
    }

    return { events, nowInsideZoneIds };
  }
}
