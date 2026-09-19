import { integer, text } from 'drizzle-orm/sqlite-core';

/**
 * Every row in MedOS carries these four columns.
 *
 * - `id` is a UUID rather than an autoincrement integer so that two devices
 *   (phone + a future laptop/web client) can create rows offline and merge
 *   later without primary-key collisions.
 * - `deletedAt` means nothing is ever hard-deleted. In a clinical record a
 *   mistaken delete costs far more than a wasted row.
 */
export const baseColumns = {
  id: text('id').primaryKey(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
};

/** A Gregorian ISO date, `YYYY-MM-DD`. Jalali conversion happens in the UI only. */
export const isoDate = (name: string) => text(name);

/** SQLite has no boolean type; drizzle maps 0/1 for us. */
export const bool = (name: string) => integer(name, { mode: 'boolean' });

/** Free-form string arrays (phone numbers, tags) stored as a JSON column. */
export const jsonList = (name: string) => text(name, { mode: 'json' }).$type<string[]>();
