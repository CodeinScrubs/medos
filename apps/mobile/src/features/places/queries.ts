import { and, asc, desc, eq, getTableColumns, isNull, sql, type SQL } from 'drizzle-orm';

import { db, type DbTransaction } from '@/db/client';
import { extensions, places, type NewPlace, type Place } from '@/db/schema';
import { matchesSearch } from '@/db/search';
import { newId, stamps, touch } from '@/lib/ids';

import { extensionSearchText, placeSearchText } from './logic';
import { extensionActionBasis, placeActionBasis } from './trash-queries';

export { deleteExtension, deletePlace } from './trash-queries';

const alivePlace = isNull(places.deletedAt);
const aliveExt = isNull(extensions.deletedAt);

function requireInputFields(input: object, allowed: Readonly<Record<string, true>>): void {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !Object.prototype.hasOwnProperty.call(allowed, key))
  )
    throw new Error('اطلاعات ویرایش معتبر نیست؛ مکان یا داخلی تغییر نکرد.');
}

/** Drizzle skips undefined updates; the merged search basis must skip them too. */
function definedPatch<T extends object>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
}

/* -------------------------------------------------------------------------- */
/*  Places                                                                      */
/* -------------------------------------------------------------------------- */

export function placesQuery(filter: { search?: string; kind?: Place['kind'] } = {}) {
  const clauses: (SQL | undefined)[] = [alivePlace];
  if (filter.kind) clauses.push(eq(places.kind, filter.kind));
  clauses.push(...matchesSearch(places.searchText, filter.search));
  return db
    .select({ ...getTableColumns(places), expectedBasis: placeActionBasis() })
    .from(places)
    .where(and(...clauses))
    .orderBy(desc(places.starred), asc(places.name));
}

export function placeQuery(id: string | null) {
  return db
    .select({ ...getTableColumns(places), expectedBasis: placeActionBasis() })
    .from(places)
    .where(and(alivePlace, id === null ? sql`0` : eq(places.id, id)))
    .limit(1);
}

export type PlaceInput = Omit<NewPlace, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'searchText'>;
const placeFields: Record<keyof PlaceInput, true> = {
  name: true,
  kind: true,
  city: true,
  address: true,
  lat: true,
  lng: true,
  mapUrl: true,
  phone: true,
  switchboard: true,
  website: true,
  notes: true,
  tags: true,
  starred: true,
};

export async function createPlace(input: PlaceInput): Promise<string> {
  return db.transaction((tx) => createPlaceInTransaction(tx, input, new Date()));
}

export function createPlaceInTransaction(tx: DbTransaction, input: PlaceInput, now: Date): string {
  requireInputFields(input, placeFields);
  const id = newId();
  tx.insert(places)
    .values({ ...input, id, ...stamps(now), searchText: placeSearchText(input) })
    .run();
  return id;
}

export async function updatePlace(id: string, input: Partial<PlaceInput>): Promise<void> {
  db.transaction((tx) => updatePlaceInTransaction(tx, id, input, new Date()));
}

export function updatePlaceInTransaction(tx: DbTransaction, id: string, input: Partial<PlaceInput>, now: Date): void {
  requireInputFields(input, placeFields);
  const patch = definedPatch(input);
  const current = requireLivePlace(tx, id);
  // Read children in this transaction too: a concurrent creation or edit
  // must not be skipped or rebuilt from an earlier search snapshot.
  const renamed = patch.name !== undefined && patch.name !== current.name;
  const exts = renamed ? tx.select().from(extensions).where(eq(extensions.placeId, id)).all() : [];
  tx.update(places)
    .set({ ...patch, ...touch(now), searchText: placeSearchText({ ...current, ...patch }) })
    .where(and(alivePlace, eq(places.id, id)))
    .run();
  for (const e of exts) {
    tx.update(extensions)
      .set({ searchText: extensionSearchText(e, patch.name) })
      .where(eq(extensions.id, e.id))
      .run();
  }
}

/* -------------------------------------------------------------------------- */
/*  Extensions (داخلی‌ها)                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Extensions across every hospital at once, most-dialled first. Searching
 * "سونو" should surface the ultrasound room of whichever hospital it is in.
 */
export function extensionsQuery(filter: { search?: string; placeId?: string } = {}) {
  const clauses: (SQL | undefined)[] = [aliveExt, alivePlace];
  if (filter.placeId) clauses.push(eq(extensions.placeId, filter.placeId));
  clauses.push(...matchesSearch(extensions.searchText, filter.search));
  return db
    .select({ extension: extensions, place: places, expectedBasis: extensionActionBasis() })
    .from(extensions)
    .innerJoin(places, eq(extensions.placeId, places.id))
    .where(and(...clauses))
    .orderBy(desc(extensions.starred), desc(extensions.usageCount), asc(extensions.department));
}

export function extensionQuery(id: string) {
  return db
    .select()
    .from(extensions)
    .where(and(aliveExt, eq(extensions.id, id)))
    .limit(1);
}

/** Read only the selected historical reference; archived places stay out of choices. */
export function extensionPlaceQuery(placeId: string | null) {
  return db
    .select()
    .from(places)
    .where(placeId === null ? sql`0` : eq(places.id, placeId))
    .limit(1);
}

export type ExtensionInput = {
  placeId: string;
  department: string;
  extension: string;
  directLine?: string | null;
  floor?: string | null;
  availableHours?: string | null;
  contactPerson?: string | null;
  notes?: string | null;
};
const extensionFields: Record<keyof ExtensionInput, true> = {
  placeId: true,
  department: true,
  extension: true,
  directLine: true,
  floor: true,
  availableHours: true,
  contactPerson: true,
  notes: true,
};

function requireLivePlace(tx: DbTransaction, placeId: string): Place {
  const current = tx
    .select()
    .from(places)
    .where(and(alivePlace, eq(places.id, placeId)))
    .get();
  if (!current) throw new Error('مکان در دسترس نیست؛ ممکن است حذف شده باشد.');
  return current;
}

export async function createExtension(input: ExtensionInput): Promise<string> {
  return db.transaction((tx) => createExtensionInTransaction(tx, input, new Date()));
}

export function createExtensionInTransaction(tx: DbTransaction, input: ExtensionInput, now: Date): string {
  requireInputFields(input, extensionFields);
  const place = requireLivePlace(tx, input.placeId);
  const id = newId();
  tx.insert(extensions)
    .values({ ...input, id, ...stamps(now), searchText: extensionSearchText(input, place.name) })
    .run();
  return id;
}

export async function updateExtension(id: string, input: Partial<ExtensionInput>): Promise<void> {
  db.transaction((tx) => updateExtensionInTransaction(tx, id, input, new Date()));
}

export function updateExtensionInTransaction(
  tx: DbTransaction,
  id: string,
  input: Partial<ExtensionInput>,
  now: Date,
): void {
  requireInputFields(input, extensionFields);
  const patch = definedPatch(input);
  const current = tx
    .select()
    .from(extensions)
    .where(and(aliveExt, eq(extensions.id, id)))
    .get();
  if (!current) throw new Error('داخلی در دسترس نیست؛ ممکن است حذف شده باشد.');
  requireLivePlace(tx, current.placeId);
  const merged = { ...current, ...patch };
  const place = requireLivePlace(tx, merged.placeId);
  tx.update(extensions)
    .set({ ...patch, ...touch(now), searchText: extensionSearchText(merged, place.name) })
    .where(and(aliveExt, eq(extensions.id, id)))
    .run();
}

/** Bumped on every call or copy, so the list learns what is actually used. */
function requireExtensionDeviceChoice(reader: Pick<DbTransaction, 'select'>, id: string, expectedBasis: string) {
  const row = reader
    .select({ extension: extensions, place: places, basis: extensionActionBasis() })
    .from(extensions)
    .innerJoin(places, eq(extensions.placeId, places.id))
    .where(and(aliveExt, alivePlace, eq(extensions.id, id)))
    .get();
  if (!row || typeof expectedBasis !== 'string' || !/^[a-f0-9]{64}$/.test(expectedBasis) || row.basis !== expectedBasis)
    throw new Error('داخلی یا مکان اصلی تغییر کرده است؛ فهرست را دوباره بخوانید.');
  return row;
}

/** Original native choice is checked before an irreversible device request. */
export function assertExtensionDeviceChoice(id: string, expectedBasis: string) {
  return requireExtensionDeviceChoice(db, id, expectedBasis);
}

export function assertPlaceDeviceChoice(id: string, expectedBasis: string) {
  const row = placeQuery(id).get();
  if (
    !row ||
    typeof expectedBasis !== 'string' ||
    !/^[a-f0-9]{64}$/.test(expectedBasis) ||
    row.expectedBasis !== expectedBasis
  )
    throw new Error('مکان تغییر کرده است؛ فهرست را دوباره بخوانید.');
  return row;
}

/** Optional counter acknowledges only the exact original live choice after native success. */
export async function recordExtensionUse(id: string, expectedBasis: string): Promise<void> {
  db.transaction((tx) => {
    requireExtensionDeviceChoice(tx, id, expectedBasis);
    tx.update(extensions)
      .set({ usageCount: sql`${extensions.usageCount} + 1` })
      .where(and(aliveExt, eq(extensions.id, id)))
      .run();
  });
}

export async function setExtensionStarred(
  id: string,
  starred: boolean,
  expectedBasis: string,
  now: Date,
): Promise<void> {
  if (typeof starred !== 'boolean' || !(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new Error('انتخاب ستاره یا زمان ثبت معتبر نیست.');
  db.transaction((tx) => {
    requireExtensionDeviceChoice(tx, id, expectedBasis);
    tx.update(extensions)
      .set({ starred, ...touch(now) })
      .where(and(aliveExt, eq(extensions.id, id)))
      .run();
  });
}

/** Rebuild the search index of every place and extension; see features/search/reindex.ts. */
export async function reindexPlaces(): Promise<number> {
  let changed = 0;
  db.transaction((tx) => {
    const placeRows = tx.select().from(places).all();
    const extRows = tx.select().from(extensions).all();
    const nameById = new Map(placeRows.map((p) => [p.id, p.name]));
    for (const p of placeRows) {
      const next = placeSearchText(p);
      if (next === p.searchText) continue;
      tx.update(places).set({ searchText: next }).where(eq(places.id, p.id)).run();
      changed += 1;
    }
    for (const e of extRows) {
      const next = extensionSearchText(e, nameById.get(e.placeId));
      if (next === e.searchText) continue;
      tx.update(extensions).set({ searchText: next }).where(eq(extensions.id, e.id)).run();
      changed += 1;
    }
  });
  return changed;
}
