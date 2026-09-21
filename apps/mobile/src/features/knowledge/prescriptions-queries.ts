import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';

import { db } from '@/db/client';
import { prescriptionTemplates, specialties, type PrescriptionItem, type PrescriptionTemplate } from '@/db/schema';
import { matchesSearch } from '@/db/search';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { cleanItems, prescriptionSearchText } from './logic';

/*
 * The user's own prescription templates for presentations they see weekly.
 *
 * MedOS reproduces what they wrote and counts how often they reached for it.
 * It does not suggest a drug, check a dose or warn about an interaction —
 * this is a notebook, not decision support.
 */

const alive = isNull(prescriptionTemplates.deletedAt);

export type PrescriptionFilter = {
  search?: string;
  specialtyId?: string | null;
  ageGroup?: PrescriptionTemplate['ageGroup'] | null;
  starredOnly?: boolean;
};

export function prescriptionsQuery(filter: PrescriptionFilter = {}) {
  const clauses: (SQL | undefined)[] = [alive];
  if (filter.specialtyId) clauses.push(eq(prescriptionTemplates.specialtyId, filter.specialtyId));
  if (filter.ageGroup) clauses.push(eq(prescriptionTemplates.ageGroup, filter.ageGroup));
  if (filter.starredOnly) clauses.push(eq(prescriptionTemplates.starred, true));
  clauses.push(...matchesSearch(prescriptionTemplates.searchText, filter.search));

  return db
    .select({ template: prescriptionTemplates, specialty: specialties })
    .from(prescriptionTemplates)
    .leftJoin(specialties, eq(prescriptionTemplates.specialtyId, specialties.id))
    .where(and(...clauses))
    .orderBy(desc(prescriptionTemplates.starred), desc(prescriptionTemplates.usageCount));
}

export function prescriptionQuery(id: string) {
  return db
    .select()
    .from(prescriptionTemplates)
    .where(and(alive, eq(prescriptionTemplates.id, id)))
    .limit(1);
}

export type PrescriptionInput = {
  title: string;
  condition?: string | null;
  specialtyId?: string | null;
  ageGroup?: PrescriptionTemplate['ageGroup'];
  items: PrescriptionItem[];
  adviceText?: string | null;
  cautionsText?: string | null;
  followUpText?: string | null;
  tags?: string[];
  starred?: boolean;
};

function values(input: PrescriptionInput) {
  return {
    title: input.title.trim(),
    condition: input.condition?.trim() || null,
    specialtyId: input.specialtyId ?? null,
    ageGroup: input.ageGroup ?? ('any' as const),
    items: cleanItems(input.items ?? []),
    adviceText: input.adviceText?.trim() || null,
    cautionsText: input.cautionsText?.trim() || null,
    followUpText: input.followUpText?.trim() || null,
    tags: input.tags ?? [],
    starred: input.starred ?? false,
  };
}

export async function createPrescription(input: PrescriptionInput): Promise<string> {
  const id = newId();
  const row = values(input);
  await db.insert(prescriptionTemplates).values({
    id,
    ...stamps(),
    ...row,
    searchText: prescriptionSearchText(row, row.items),
  });
  return id;
}

export async function updatePrescription(id: string, patch: Partial<PrescriptionInput>): Promise<void> {
  const current = (await prescriptionQuery(id))[0];
  if (!current) throw new Error(`Prescription ${id} not found`);
  const row = values({ ...current, ...patch } as PrescriptionInput);
  await db
    .update(prescriptionTemplates)
    .set({ ...row, searchText: prescriptionSearchText(row, row.items), ...touch() })
    .where(and(alive, eq(prescriptionTemplates.id, id)));
}

/**
 * Record that the template was used — the list is ordered by this, so the
 * three prescriptions written every clinic rise to the top on their own.
 */
export async function markPrescriptionUsed(id: string): Promise<void> {
  const current = (await prescriptionQuery(id))[0];
  if (!current) return;
  await db
    .update(prescriptionTemplates)
    .set({ usageCount: current.usageCount + 1, lastUsedAt: new Date(), ...touch() })
    .where(eq(prescriptionTemplates.id, id));
}

export async function setPrescriptionStarred(id: string, starred: boolean): Promise<void> {
  await db
    .update(prescriptionTemplates)
    .set({ starred, ...touch() })
    .where(eq(prescriptionTemplates.id, id));
}

/** Copy a template as the starting point for a variant. */
export async function duplicatePrescription(id: string): Promise<string> {
  const current = (await prescriptionQuery(id))[0];
  if (!current) throw new Error(`Prescription ${id} not found`);
  return createPrescription({
    title: `${current.title} (کپی)`,
    condition: current.condition,
    specialtyId: current.specialtyId,
    ageGroup: current.ageGroup,
    items: Array.isArray(current.items) ? current.items : [],
    adviceText: current.adviceText,
    cautionsText: current.cautionsText,
    followUpText: current.followUpText,
    tags: current.tags ?? [],
  });
}

export async function deletePrescription(id: string): Promise<void> {
  await db.update(prescriptionTemplates).set(softDelete()).where(eq(prescriptionTemplates.id, id));
}

export async function reindexPrescriptions(): Promise<number> {
  const rows = await db.select().from(prescriptionTemplates);
  let changed = 0;
  db.transaction((tx) => {
    for (const r of rows) {
      const next = prescriptionSearchText(r, Array.isArray(r.items) ? r.items : []);
      if (next === r.searchText) continue;
      tx.update(prescriptionTemplates).set({ searchText: next }).where(eq(prescriptionTemplates.id, r.id)).run();
      changed += 1;
    }
  });
  return changed;
}
