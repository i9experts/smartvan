/* eslint-disable prettier/prettier */
import { Client } from '@googlemaps/google-maps-services-js';

const client = new Client({});

/**
 * Short human-readable place for a point ("Block 13-D, Gulshan-e-Iqbal,
 * Karachi"), or null if Google can't resolve it / no key is configured.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  try {
    const res = await client.reverseGeocode({ params: { latlng: { lat, lng }, key }, timeout: 5000 });
    const best = res.data.results?.[0];
    if (!best) return null;
    // Drop the country and postcode — the admin only needs the area.
    const parts = (best.formatted_address || '')
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p && !/^pakistan$/i.test(p) && !/^\d{4,6}$/.test(p));
    return parts.slice(0, 4).join(', ') || null;
  } catch (e) {
    console.error('[geocode] reverse failed:', (e as any)?.message || e);
    return null;
  }
}

export interface GeocodedAreas {
  city: string | null;
  district: string | null;
  town: string | null;
  country: string | null;
}

/**
 * Structured area breakdown for a point, for filterable analytics (Parent
 * Intelligence) rather than human display — callers need city/district/
 * country as separate, consistently-valued fields to group and filter by,
 * which the joined single-string reverseGeocode() above can't provide.
 */
export async function reverseGeocodeAreas(lat: number, lng: number): Promise<GeocodedAreas | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  try {
    const res = await client.reverseGeocode({ params: { latlng: { lat, lng }, key }, timeout: 5000 });
    const best = res.data.results?.[0];
    if (!best) return null;

    const find = (...types: string[]) =>
      best.address_components.find((c) => types.some((t) => (c.types as string[]).includes(t)))?.long_name || null;

    return {
      city: find('locality', 'administrative_area_level_2'),
      district: find('administrative_area_level_2', 'sublocality', 'sublocality_level_1'),
      town: find('sublocality', 'sublocality_level_1', 'neighborhood'),
      country: find('country'),
    };
  } catch (e) {
    console.error('[geocode] reverse areas failed:', (e as any)?.message || e);
    return null;
  }
}
