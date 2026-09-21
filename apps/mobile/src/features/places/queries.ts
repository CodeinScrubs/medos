import { and, asc, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db/client';
import { extensions, places, type NewPlace, type Place } from '@/db/schema';
import { matchesSearch } from '@/db/search';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { extensionSearchText, placeSearchText } from './logic';

const alivePlace = isNull(places.deletedAt);
const aliveExt = isNull(extensions.deletedAt);

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
  const current = (await placeQuery(id))[0];
  if (!current) throw new Error(`Place ${id} not found`);

  // Extensions index their hospital's name; a rename must reach them too, or
  // "<new name> سونو" would find nothing. Both writes land together.
  const renamed = input.name !== undefined && input.name !== current.name;
  const exts = renamed ? await db.select().from(extensions).where(eq(extensions.placeId, id)) : [];

  db.transaction((tx) => {
    tx.update(places)
      .set({ ...input, ...touch(), searchText: placeSearchText({ ...current, ...input }) })
      .where(eq(places.id, id))
      .run();
    for (const e of exts) {
      tx.update(extensions)
        .set({ searchText: extensionSearchText(e, input.name) })
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

async function placeName(placeId: string | undefined): Promise<string | null> {
  if (!placeId) return null;
  return (await placeQuery(placeId))[0]?.name ?? null;
}

export async function createExtension(input: ExtensionInput): Promise<string> {
  const id = newId();
  await db.insert(extensions).values({
    ...input,
    id,
    ...stamps(),
    searchText: extensionSearchText(input, await placeName(input.placeId)),
  });
  return id;
}

export async function updateExtension(id: string, input: Partial<ExtensionInput>): Promise<void> {
  const current = (await db.select().from(extensions).where(eq(extensions.id, id)).limit(1))[0];
  if (!current) throw new Error(`Extension ${id} not found`);
  await db
    .update(extensions)
    .set({
      ...input,
      ...touch(),
      searchText: extensionSearchText({ ...current, ...input }, await placeName(input.placeId ?? current.placeId)),
    })
    .where(eq(extensions.id, id));
}

/** Bumped on every call or copy, so the list learns what is actually used. */
export async function recordExtensionUse(id: string): Promise<void> {
  await db
    .update(extensions)
    .set({ usageCount: sql`${extensions.usageCount} + 1` })
    .where(eq(extensions.id, id));
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
  const placeRows = await db.select().from(places);
  const extRows = await db.select().from(extensions);
  const nameById = new Map(placeRows.map((p) => [p.id, p.name]));
  let changed = 0;
  db.transaction((tx) => {
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
