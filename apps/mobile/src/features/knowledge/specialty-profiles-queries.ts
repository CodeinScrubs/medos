import { and, asc, desc, eq, isNull, type SQL } from 'drizzle-orm';

import { db, type DbTransaction } from '@/db/client';
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
function specialtyWords(tx: DbTransaction, specialtyId: string | null | undefined, previous?: string | null): string[] {
  if (specialtyId == null) return [];
  const row = tx.select().from(specialties).where(eq(specialties.id, specialtyId)).get();
  if (!row || (row.deletedAt !== null && specialtyId !== previous)) throw new Error('تخصص انتخاب‌شده در دسترس نیست.');
  return [row.nameFa, row.nameEn ?? '', ...(row.aliases ?? [])].filter(Boolean);
}

export function createSpecialtyProfileInTransaction(
  tx: DbTransaction,
  input: SpecialtyProfileInput,
  now: Date,
): string {
  const id = newId();
  tx.insert(specialtyProfiles)
    .values({
      id,
      ...stamps(now),
      ...input,
      searchText: specialtyProfileSearchText(input, specialtyWords(tx, input.specialtyId)),
    })
    .run();
  return id;
}

export function updateSpecialtyProfileInTransaction(
  tx: DbTransaction,
  id: string,
  patch: SpecialtyProfileInput,
  now: Date,
): void {
  const current = tx
    .select()
    .from(specialtyProfiles)
    .where(and(alive, eq(specialtyProfiles.id, id)))
    .get();
  if (!current) throw new Error('رشته در دسترس نیست.');
  const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  const merged = { ...current, ...defined };
  tx.update(specialtyProfiles)
    .set({
      ...defined,
      searchText: specialtyProfileSearchText(merged, specialtyWords(tx, merged.specialtyId, current.specialtyId)),
      ...touch(now),
    })
    .where(and(alive, eq(specialtyProfiles.id, id)))
    .run();
}

export async function createSpecialtyProfile(input: SpecialtyProfileInput): Promise<string> {
  return db.transaction((tx) => createSpecialtyProfileInTransaction(tx, input, new Date()));
}

export async function updateSpecialtyProfile(id: string, patch: SpecialtyProfileInput): Promise<void> {
  db.transaction((tx) => updateSpecialtyProfileInTransaction(tx, id, patch, new Date()));
}

export async function deleteSpecialtyProfile(id: string): Promise<void> {
  await db.update(specialtyProfiles).set(softDelete()).where(eq(specialtyProfiles.id, id));
}

export async function reindexSpecialtyProfiles(): Promise<number> {
  let changed = 0;
  db.transaction((tx) => {
    const rows = tx.select().from(specialtyProfiles).all();
    const specialtyRows = tx.select().from(specialties).all();
    const wordsById = new Map(specialtyRows.map((s) => [s.id, [s.nameFa, s.nameEn ?? '', ...(s.aliases ?? [])]]));
    for (const p of rows) {
      const next = specialtyProfileSearchText(p, p.specialtyId ? (wordsById.get(p.specialtyId) ?? []) : []);
      if (next === p.searchText) continue;
      tx.update(specialtyProfiles).set({ searchText: next }).where(eq(specialtyProfiles.id, p.id)).run();
      changed += 1;
    }
  });
  return changed;
}
