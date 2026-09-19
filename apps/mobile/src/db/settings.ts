import { eq } from 'drizzle-orm';
import type { z } from 'zod';

import { db } from './client';
import { settings } from './schema';

/**
 * Typed app preferences, stored as JSON in the `settings` table.
 *
 * Each feature declares its own settings with `defineSetting`, next to the
 * code that uses them. Every read is validated: a missing, corrupted or
 * wrongly-typed stored value falls back to the declared default instead of
 * reaching a screen as garbage.
 *
 * Settings live in the database on purpose, so they travel with a backup.
 * Secrets never go here — keys live in the Android Keystore via SecureStore.
 */

export type SettingDef<T> = {
  readonly key: string;
  readonly schema: z.ZodType<T>;
  readonly fallback: T;
};

export function defineSetting<T>(key: string, schema: z.ZodType<T>, fallback: T): SettingDef<T> {
  return { key, schema, fallback };
}

/** Decode a stored row; anything unreadable yields the default. */
export function parseSetting<T>(def: SettingDef<T>, row: { value: string | null } | undefined): T {
  if (!row?.value) return def.fallback;
  try {
    const parsed = def.schema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : def.fallback;
  } catch {
    return def.fallback;
  }
}

export async function readSetting<T>(def: SettingDef<T>): Promise<T> {
  const rows = await db.select().from(settings).where(eq(settings.key, def.key)).limit(1);
  return parseSetting(def, rows[0]);
}

export async function writeSetting<T>(def: SettingDef<T>, value: T): Promise<void> {
  // Validate on the way in too, so a bad write fails at the call site rather
  // than surfacing later as a silently ignored value.
  const checked = def.schema.parse(value);
  const json = JSON.stringify(checked);
  const now = new Date();
  await db
    .insert(settings)
    .values({ key: def.key, value: json, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value: json, updatedAt: now } });
}

/** Live query for one setting; pair with `parseSetting` in a component. */
export function settingQuery<T>(def: SettingDef<T>) {
  return db.select().from(settings).where(eq(settings.key, def.key)).limit(1);
}
