import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { audit } from '@/db/audit';
import { db } from '@/db/client';
import { labValues } from '@/db/schema';
import { defineSetting, readSetting, writeSetting } from '@/db/settings';

import { computeFlag, parseLabValue } from './flags';

/**
 * A lab row's H/L flag is worked out once, when the row is written, and stored.
 * That is what a table of results needs — but it means a change to the rule
 * leaves every earlier row carrying the old verdict, and a wrong flag on an
 * old result reads exactly like a fact.
 *
 * Bump this with any change to `computeFlag`. On the next launch every stored
 * flag is worked out again from the row's own text and range; rows whose flag
 * is already right are left untouched, which is nearly all of them. The value
 * and the range are never touched — only the app's opinion of them.
 *
 * 1: `>=100` against 3–100 no longer reads as high, and `<5` no longer as
 *    normal, because a bound only decides a flag when every value it allows
 *    falls on one side.
 */
export const LAB_FLAG_VERSION = 1;

const flaggedVersion = defineSetting('labs.flagVersion', z.number().int().min(0), 0);

export async function reflagLabValuesIfNeeded(): Promise<void> {
  const current = await readSetting(flaggedVersion);
  if (current === LAB_FLAG_VERSION) return;

  const rows = await db.select().from(labValues);
  let changed = 0;
  let cleared = 0;
  for (const row of rows) {
    const next = computeFlag(parseLabValue(row.value), row.refLow, row.refHigh);
    if (next === row.flag) continue;
    // `touch()` is deliberately not called: nobody edited this result, and an
    // updatedAt that moves would make every old row look freshly changed.
    await db.update(labValues).set({ flag: next }).where(eq(labValues.id, row.id));
    changed += 1;
    if (next == null) cleared += 1;
  }
  await writeSetting(flaggedVersion, LAB_FLAG_VERSION);

  if (changed > 0) {
    await audit('labs.reflagged', { detail: { from: current, to: LAB_FLAG_VERSION, changed, cleared } });
  }
}
