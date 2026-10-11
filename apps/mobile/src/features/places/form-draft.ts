import { z } from 'zod';

import type { Extension, Place } from '@/db/schema';
import { formCodec } from '@/lib/form-document';
import { toLatinDigits } from '@/lib/persian';

import { parseCoordinates } from './logic';
import type { ExtensionInput, PlaceInput } from './queries';

const placeFields = z
  .object({
    name: z.string(),
    kind: z.enum(['hospital', 'clinic', 'office', 'lab', 'imaging', 'pharmacy', 'university', 'other']),
    city: z.string(),
    address: z.string(),
    phone: z.string(),
    switchboard: z.string(),
    mapUrl: z.string(),
    lat: z.string(),
    lng: z.string(),
    notes: z.string(),
  })
  .strict();
export type PlaceFormFields = z.infer<typeof placeFields>;
export const placeFormCodec = formCodec('place', placeFields);

export function initialPlaceFields(row: Place | null): PlaceFormFields {
  return {
    name: row?.name ?? '',
    kind: row?.kind ?? 'hospital',
    city: row?.city ?? '',
    address: row?.address ?? '',
    phone: row?.phone ?? '',
    switchboard: row?.switchboard ?? '',
    mapUrl: row?.mapUrl ?? '',
    lat: row?.lat ?? '',
    lng: row?.lng ?? '',
    notes: row?.notes ?? '',
  };
}

/** Raw typing never folds digits or derives another field. Only Save does so. */
export function placeFormInput(fields: PlaceFormFields): PlaceInput {
  if (!fields.name.trim()) throw new Error('نام لازم است.');
  const coordinates = !fields.lat.trim() && !fields.lng.trim() ? parseCoordinates(fields.mapUrl) : null;
  return {
    name: fields.name.trim(),
    kind: fields.kind,
    city: fields.city.trim() || null,
    address: fields.address.trim() || null,
    phone: toLatinDigits(fields.phone).trim() || null,
    switchboard: toLatinDigits(fields.switchboard).trim() || null,
    mapUrl: fields.mapUrl.trim() || null,
    lat: toLatinDigits(fields.lat).trim() || coordinates?.lat || null,
    lng: toLatinDigits(fields.lng).trim() || coordinates?.lng || null,
    notes: fields.notes.trim() || null,
  };
}

const extensionFields = z
  .object({
    // Preserve even an imported empty reference; publication checks the actual key.
    placeId: z.string().nullable(),
    department: z.string(),
    extension: z.string(),
    directLine: z.string(),
    floor: z.string(),
    contactPerson: z.string(),
    notes: z.string(),
  })
  .strict();
export type ExtensionFormFields = z.infer<typeof extensionFields>;
export const extensionFormCodec = formCodec('extension', extensionFields);

export function initialExtensionFields(
  row: Extension | null,
  initialPlaceId: string | null = null,
): ExtensionFormFields {
  return {
    placeId: row?.placeId ?? initialPlaceId,
    department: row?.department ?? '',
    extension: row?.extension ?? '',
    directLine: row?.directLine ?? '',
    floor: row?.floor ?? '',
    contactPerson: row?.contactPerson ?? '',
    notes: row?.notes ?? '',
  };
}

export function extensionFormInput(fields: ExtensionFormFields): ExtensionInput {
  if (fields.placeId === null) throw new Error('بیمارستان را انتخاب کنید.');
  if (!fields.department.trim() || !fields.extension.trim()) throw new Error('نام بخش و شمارهٔ داخلی لازم است.');
  return {
    placeId: fields.placeId,
    department: fields.department.trim(),
    extension: toLatinDigits(fields.extension).trim(),
    directLine: toLatinDigits(fields.directLine).trim() || null,
    floor: toLatinDigits(fields.floor).trim() || null,
    contactPerson: fields.contactPerson.trim() || null,
    notes: fields.notes.trim() || null,
  };
}
