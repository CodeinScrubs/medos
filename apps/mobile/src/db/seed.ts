import { z } from 'zod';

import { newId, stamps } from '@/lib/ids';

import { db } from './client';
import { specialties } from './schema';
import { SPECIALTY_SEED } from './seed-specialties';
import { defineSetting, writeSetting } from './settings';

const SEED_VERSION = 1;
const seededVersion = defineSetting('seed.specialties.version', z.number().int().nullable(), null);

/**
 * Insert any seeded specialty whose slug is not already present.
 *
 * Deliberately additive: an entry the user renamed, or a specialty they added
 * by hand, is never overwritten, so shipping a longer list in a later version
 * is safe.
 */
export async function seedSpecialties(): Promise<number> {
  const existing = await db.select({ id: specialties.id, slug: specialties.slug }).from(specialties);

  const idBySlug = new Map<string, string>();
  for (const row of existing) if (row.slug) idBySlug.set(row.slug, row.id);

  const missing = SPECIALTY_SEED.filter((s) => !idBySlug.has(s.slug));
  if (missing.length === 0) return 0;

  // Parents first, so `parentId` resolves in a single pass.
  const ordered = [...missing].sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0));

  // drizzle's expo-sqlite transactions are synchronous: an async callback would
  // commit before the inserts ran. Every statement inside uses `.run()`.
  db.transaction((tx) => {
    let order = existing.length;
    for (const s of ordered) {
      const id = newId();
      idBySlug.set(s.slug, id);
      tx.insert(specialties)
        .values({
          id,
          ...stamps(),
          slug: s.slug,
          nameFa: s.nameFa,
          nameEn: s.nameEn,
          parentId: s.parent ? (idBySlug.get(s.parent) ?? null) : null,
          kind: s.kind,
          aliases: s.aliases ?? null,
          isSeeded: true,
          sortOrder: order++,
        })
        .run();
    }
  });

  await writeSetting(seededVersion, SEED_VERSION);
  return ordered.length;
}

/** Everything that must exist before the first screen is useful. */
export async function runSeeds(): Promise<void> {
  await seedSpecialties();
}
