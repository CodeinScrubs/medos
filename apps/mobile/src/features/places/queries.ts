import { and, asc, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';

import { db, type DbTransaction } from '@/db/client';
import { extensions, places, type NewPlace, type Place } from '@/db/schema';
import { matchesSearch } from '@/db/search';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { extensionSearchText, placeSearchText } from './logic';

const alivePlace = isNull(places.deletedAt);
const aliveExt = isNull(extensions.deletedAt);

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
    .select()
    .from(places)
    .where(and(...clauses))
    .orderBy(desc(places.starred), asc(places.name));
}

export function placeQuery(id: string) {
  return db
    .select()
    .from(places)
    .where(and(alivePlace, eq(places.id, id)))
    .limit(1);
}

export type PlaceInput = Omit<NewPlace, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'searchText'>;

export async function createPlace(input: PlaceInput): Promise<string> {
  const id = newId();
  await db.insert(places).values({ ...input, id, ...stamps(), searchText: placeSearchText(input) });
  return id;
}

export async function updatePlace(id: string, input: Partial<PlaceInput>): Promise<void> {
  const patch = definedPatch(input);
  db.transaction((tx) => {
    const current = requireLivePlace(tx, id);
    // Read children in this transaction too: a concurrent creation or edit
    // must not be skipped or rebuilt from an earlier search snapshot.
    const renamed = patch.name !== undefined && patch.name !== current.name;
    const exts = renamed ? tx.select().from(extensions).where(eq(extensions.placeId, id)).all() : [];
    tx.update(places)
      .set({ ...patch, ...touch(), searchText: placeSearchText({ ...current, ...patch }) })
      .where(and(alivePlace, eq(places.id, id)))
      .run();
    for (const e of exts) {
      tx.update(extensions)
        .set({ searchText: extensionSearchText(e, patch.name) })
        .where(eq(extensions.id, e.id))
        .run();
    }
  });
}

export async function deletePlace(id: string): Promise<void> {
  await db.update(places).set(softDelete()).where(eq(places.id, id));
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
    .select({ extension: extensions, place: places })
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
  return db.transaction((tx) => {
    const place = requireLivePlace(tx, input.placeId);
    const id = newId();
    tx.insert(extensions)
      .values({ ...input, id, ...stamps(), searchText: extensionSearchText(input, place.name) })
      .run();
    return id;
  });
}

export async function updateExtension(id: string, input: Partial<ExtensionInput>): Promise<void> {
  const patch = definedPatch(input);
  db.transaction((tx) => {
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
      .set({ ...patch, ...touch(), searchText: extensionSearchText(merged, place.name) })
      .where(and(aliveExt, eq(extensions.id, id)))
      .run();
  });
}

/** Bumped on every call or copy, so the list learns what is actually used. */
export async function recordExtensionUse(id: string): Promise<void> {
  await db
    .update(extensions)
    .set({ usageCount: sql`${extensions.usageCount} + 1` })
    .where(and(aliveExt, eq(extensions.id, id)));
}

export async function setExtensionStarred(id: string, starred: boolean): Promise<void> {
  await db
    .update(extensions)
    .set({ starred, ...touch() })
    .where(eq(extensions.id, id));
}

export async function deleteExtension(id: string): Promise<void> {
  await db.update(extensions).set(softDelete()).where(eq(extensions.id, id));
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
