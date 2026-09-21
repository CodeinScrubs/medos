import { and, asc, desc, eq, isNull, type SQL } from 'drizzle-orm';

import { db } from '@/db/client';
import { specialties, specialtyProfiles, type SpecialtyProfile } from '@/db/schema';
import { matchesSearch } from '@/db/search';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { specialtyProfileSearchText } from './logic';

/*
 * "What is this field actually like?" — notes gathered while deciding on a
 * path: the work, the residency, the lifestyle, the market, and who said so.
 *
 * A profile points at a seeded specialty when there is one, and carries its
 * own name when there is not.
 */

const alive = isNull(specialtyProfiles.deletedAt);

export function specialtyProfilesQuery(filter: { search?: string } = {}) {
  const clauses: (SQL | undefined)[] = [alive, ...matchesSearch(specialtyProfiles.searchText, filter.search)];
  return db
    .select({ profile: specialtyProfiles, specialty: specialties })
    .from(specialtyProfiles)
    .leftJoin(specialties, eq(specialtyProfiles.specialtyId, specialties.id))
    .where(and(...clauses))
    .orderBy(desc(specialtyProfiles.personalFit), asc(specialtyProfiles.createdAt));
}

export function specialtyProfileQuery(id: string) {
  return db
    .select({ profile: specialtyProfiles, specialty: specialties })
    .from(specialtyProfiles)
    .leftJoin(specialties, eq(specialtyProfiles.specialtyId, specialties.id))
    .where(and(alive, eq(specialtyProfiles.id, id)))
    .limit(1);
}

export type SpecialtyProfileInput = Omit<
  Partial<SpecialtyProfile>,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'searchText'
>;

/** The specialty's own names, so searching "cardio" finds the Persian profile. */
async function specialtyWords(specialtyId: string | null | undefined): Promise<string[]> {
  if (!specialtyId) return [];
  const row = (await db.select().from(specialties).where(eq(specialties.id, specialtyId)).limit(1))[0];
  return row ? [row.nameFa, row.nameEn ?? '', ...(row.aliases ?? [])].filter(Boolean) : [];
}

export async function createSpecialtyProfile(input: SpecialtyProfileInput): Promise<string> {
  const id = newId();
  await db.insert(specialtyProfiles).values({
    id,
    ...stamps(),
    ...input,
    searchText: specialtyProfileSearchText(input, await specialtyWords(input.specialtyId)),
  });
  return id;
}

export async function updateSpecialtyProfile(id: string, patch: SpecialtyProfileInput): Promise<void> {
  const current = (await db.select().from(specialtyProfiles).where(eq(specialtyProfiles.id, id)).limit(1))[0];
  if (!current) throw new Error(`Specialty profile ${id} not found`);
  const merged = { ...current, ...patch };
  await db
    .update(specialtyProfiles)
    .set({
      ...patch,
      searchText: specialtyProfileSearchText(merged, await specialtyWords(merged.specialtyId)),
      ...touch(),
    })
    .where(eq(specialtyProfiles.id, id));
}

export async function deleteSpecialtyProfile(id: string): Promise<void> {
  await db.update(specialtyProfiles).set(softDelete()).where(eq(specialtyProfiles.id, id));
}

export async function reindexSpecialtyProfiles(): Promise<number> {
  const rows = await db.select().from(specialtyProfiles);
  const specialtyRows = await db.select().from(specialties);
  const wordsById = new Map(specialtyRows.map((s) => [s.id, [s.nameFa, s.nameEn ?? '', ...(s.aliases ?? [])]]));
  let changed = 0;
  db.transaction((tx) => {
    for (const p of rows) {
      const next = specialtyProfileSearchText(p, p.specialtyId ? (wordsById.get(p.specialtyId) ?? []) : []);
      if (next === p.searchText) continue;
      tx.update(specialtyProfiles).set({ searchText: next }).where(eq(specialtyProfiles.id, p.id)).run();
      changed += 1;
    }
  });
  return changed;
}
