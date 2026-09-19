import type { Extension, Place } from '@/db/schema';
import { buildSearchText, normalizePhone, toLatinDigits } from '@/lib/persian';

/** Digits plus the two dial-pad symbols; anything else a person typed is dropped. */
export function dialDigits(value: string): string {
  return toLatinDigits(value).replace(/[^\d*#]/g, '');
}

/**
 * How to reach an extension from outside the hospital, or null if we can't.
 *
 * A department's own direct line wins. Otherwise `tel:<switchboard>,,<ext>`:
 * the dialer calls the switchboard, waits two seconds per comma, then sends
 * the extension as tones — the same thing people do by hand.
 */
export function extensionDialUri(
  ext: Pick<Extension, 'directLine' | 'extension'>,
  place: Pick<Place, 'switchboard'>,
): string | null {
  const direct = ext.directLine ? normalizePhone(ext.directLine) : '';
  if (direct) return `tel:${direct}`;
  const switchboard = place.switchboard ? normalizePhone(place.switchboard) : '';
  const extension = dialDigits(ext.extension);
  if (switchboard && extension) return `tel:${switchboard},,${extension}`;
  return null;
}

/**
 * A URI any maps app on the phone answers (Neshan, Balad, Google Maps):
 * a saved map link wins, then coordinates, then a plain address search.
 */
export function mapsUri(place: Pick<Place, 'name' | 'mapUrl' | 'lat' | 'lng' | 'address'>): string | null {
  if (place.mapUrl) return place.mapUrl;
  if (place.lat && place.lng) {
    const lat = toLatinDigits(place.lat).trim();
    const lng = toLatinDigits(place.lng).trim();
    return `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(place.name)})`;
  }
  if (place.address) return `geo:0,0?q=${encodeURIComponent(`${place.name} ${place.address}`)}`;
  return null;
}

/** Pull coordinates out of a pasted map link or "35.70, 51.40". */
export function parseCoordinates(input: string): { lat: string; lng: string } | null {
  const text = toLatinDigits(input);
  const m = /(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)/.exec(text);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: m[1]!, lng: m[2]! };
}

export function placeSearchText(p: Partial<Pick<Place, 'name' | 'city' | 'address' | 'tags'>>): string {
  return buildSearchText(p.name, p.city, p.address, p.tags ?? undefined);
}

/**
 * The hospital's name goes into an extension's index too, so "مرکزی سونو"
 * narrows to one row while "سونو" alone finds every hospital's.
 */
export function extensionSearchText(
  e: Partial<Pick<Extension, 'department' | 'extension' | 'contactPerson' | 'floor' | 'notes'>>,
  placeName: string | null | undefined,
): string {
  return buildSearchText(e.department, e.extension, e.contactPerson, e.floor, e.notes, placeName);
}
