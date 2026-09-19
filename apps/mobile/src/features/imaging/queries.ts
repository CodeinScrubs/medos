import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { imagingStudies, type ImagingStudy } from '@/db/schema';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

const alive = isNull(imagingStudies.deletedAt);

export function patientImagingQuery(patientId: string) {
  return db
    .select()
    .from(imagingStudies)
    .where(and(alive, eq(imagingStudies.patientId, patientId)))
    .orderBy(desc(imagingStudies.studyDate));
}

export function imagingStudyQuery(id: string) {
  return db.select().from(imagingStudies).where(eq(imagingStudies.id, id)).limit(1);
}

/**
 * Places and platforms typed before, most used first — so "PACS بیمارستان مرکزی" is one
 * tap the second time instead of retyped for every study.
 */
export async function recentStorageLocations(limit = 6): Promise<{ locations: string[]; platforms: string[] }> {
  const locations = await db
    .select({ v: imagingStudies.storageLocation })
    .from(imagingStudies)
    .where(and(alive, sql`${imagingStudies.storageLocation} is not null and ${imagingStudies.storageLocation} != ''`))
    .groupBy(imagingStudies.storageLocation)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
  const platforms = await db
    .select({ v: imagingStudies.storagePlatform })
    .from(imagingStudies)
    .where(and(alive, sql`${imagingStudies.storagePlatform} is not null and ${imagingStudies.storagePlatform} != ''`))
    .groupBy(imagingStudies.storagePlatform)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
  return {
    locations: locations.map((r) => r.v!).filter(Boolean),
    platforms: platforms.map((r) => r.v!).filter(Boolean),
  };
}

export type ImagingInput = {
  patientId: string;
  modality: ImagingStudy['modality'];
  region?: string | null;
  studyDate?: Date | null;
  status: ImagingStudy['status'];
  storageLocation?: string | null;
  storagePlatform?: string | null;
  accessionNumber?: string | null;
  accessUrl?: string | null;
  accessNotes?: string | null;
  reportText?: string | null;
  impression?: string | null;
  notes?: string | null;
};

export async function createImagingStudy(input: ImagingInput): Promise<string> {
  const id = newId();
  await db.insert(imagingStudies).values({
    ...input,
    id,
    ...stamps(),
    encounterId: await resolveActiveEncounterId(input.patientId),
  });
  return id;
}

export async function updateImagingStudy(id: string, patch: Partial<Omit<ImagingInput, 'patientId'>>): Promise<void> {
  await db
    .update(imagingStudies)
    .set({ ...patch, ...touch() })
    .where(eq(imagingStudies.id, id));
}

export async function deleteImagingStudy(id: string): Promise<void> {
  await db.update(imagingStudies).set(softDelete()).where(eq(imagingStudies.id, id));
}
