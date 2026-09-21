import { and, asc, desc, eq, isNull, or, type SQL } from 'drizzle-orm';

import { db } from '@/db/client';
import { doctors, specialties, type Doctor, type NewDoctor } from '@/db/schema';
import { matchesSearch } from '@/db/search';
import { newId, softDelete, stamps, touch } from '@/lib/ids';
import { normalizePhone } from '@/lib/persian';

import { doctorDisplayName, doctorSearchText, parseDoctorName } from './logic';
import { removeDoctorOccasions } from './occasions-queries';

const alive = isNull(doctors.deletedAt);

export type DoctorFilter = {
  search?: string;
  specialtyId?: string | null;
  relationship?: Doctor['relationship'] | null;
  starredOnly?: boolean;
};

export function doctorsQuery(filter: DoctorFilter = {}) {
  const clauses: (SQL | undefined)[] = [alive];
  if (filter.specialtyId) {
    // Match either column: filtering by "کودکان" finds everyone whose specialty
    // is paediatrics, and filtering by "عفونی کودکان" finds those filed under
    // that subspecialty.
    clauses.push(or(eq(doctors.specialtyId, filter.specialtyId), eq(doctors.subspecialtyId, filter.specialtyId)));
  }
  if (filter.relationship) clauses.push(eq(doctors.relationship, filter.relationship));
  if (filter.starredOnly) clauses.push(eq(doctors.starred, true));
  clauses.push(...matchesSearch(doctors.searchText, filter.search));
  return db
    .select()
    .from(doctors)
    .where(and(...clauses))
    .orderBy(desc(doctors.starred), asc(doctors.lastName));
}

export function doctorQuery(id: string) {
  return db
    .select()
    .from(doctors)
    .where(and(alive, eq(doctors.id, id)))
    .limit(1);
}

export function specialtiesQuery() {
  return db.select().from(specialties).where(isNull(specialties.deletedAt)).orderBy(asc(specialties.sortOrder));
}

export type DoctorInput = Omit<NewDoctor, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'searchText'>;

/** Every name a doctor's specialty and subspecialty go by, for the search index. */
async function specialtyWords(d: Partial<DoctorInput>): Promise<string[]> {
  const ids = [d.specialtyId, d.subspecialtyId].filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];
  const specs = await db
    .select()
    .from(specialties)
    .where(or(...ids.map((id) => eq(specialties.id, id))));
  return specs.flatMap((s) => [s.nameFa, s.nameEn ?? '', ...(s.aliases ?? [])]);
}

export async function createDoctor(input: DoctorInput): Promise<string> {
  const id = newId();
  await db.insert(doctors).values({
    ...input,
    id,
    ...stamps(),
    phone: input.phone ? normalizePhone(input.phone) : null,
    searchText: doctorSearchText(input, await specialtyWords(input)),
  });
  return id;
}

export async function updateDoctor(id: string, input: Partial<DoctorInput>): Promise<void> {
  const current = (await doctorQuery(id))[0];
  if (!current) throw new Error(`Doctor ${id} not found`);
  const merged = { ...current, ...input };
  await db
    .update(doctors)
    .set({
      ...input,
      ...touch(),
      phone: input.phone !== undefined ? normalizePhone(input.phone ?? '') || null : current.phone,
      searchText: doctorSearchText(merged, await specialtyWords(merged)),
    })
    .where(eq(doctors.id, id));
}

export async function setDoctorStarred(id: string, starred: boolean): Promise<void> {
  await db
    .update(doctors)
    .set({ starred, ...touch() })
    .where(eq(doctors.id, id));
}

export async function deleteDoctor(id: string): Promise<void> {
  // The occasions and their alarms go with the doctor, wherever the delete
  // was pressed. Doing this in a screen only covers the screen.
  await removeDoctorOccasions(id);
  await db.update(doctors).set(softDelete()).where(eq(doctors.id, id));
}

/**
 * Turn "دکتر علی احمدی" typed into a picker into a minimal doctor record that
 * can be completed later from the doctors tab.
 */
export async function quickCreateDoctor(text: string): Promise<{ id: string; label: string }> {
  const parsed = parseDoctorName(text);
  const title = parsed.title ?? 'دکتر';
  const lastName = parsed.lastName || text.trim();
  const id = await createDoctor({ title, firstName: parsed.firstName, lastName, relationship: 'attending' });
  return { id, label: doctorDisplayName({ title, firstName: parsed.firstName, lastName }) };
}

/** Rebuild every doctor's search index; see features/search/reindex.ts. */
export async function reindexDoctors(): Promise<number> {
  const specs = await db.select().from(specialties);
  const wordsById = new Map(specs.map((s) => [s.id, [s.nameFa, s.nameEn ?? '', ...(s.aliases ?? [])]]));
  const rows = await db.select().from(doctors);
  let changed = 0;
  db.transaction((tx) => {
    for (const d of rows) {
      const words = [d.specialtyId, d.subspecialtyId].flatMap((id) => (id ? (wordsById.get(id) ?? []) : []));
      const next = doctorSearchText(d, words);
      if (next === d.searchText) continue;
      tx.update(doctors).set({ searchText: next }).where(eq(doctors.id, d.id)).run();
      changed += 1;
    }
  });
  return changed;
}
