import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { baseColumns, bool } from './_shared';

/* -------------------------------------------------------------------------- */
/*  Settings                                                                    */
/* -------------------------------------------------------------------------- */

/** Simple key/value store for app preferences. Values are JSON-encoded. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/* -------------------------------------------------------------------------- */
/*  Backup log                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One row per backup produced. The point is answering "when did I last have a
 * good copy of this, and where did it go?" without trusting memory. A backup
 * the user cannot locate is not a backup.
 */
export const backupRuns = sqliteTable(
  'backup_runs',
  {
    ...baseColumns,
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    trigger: text('trigger', { enum: ['auto', 'manual', 'pre_restore', 'pre_migration'] })
      .notNull()
      .$default(() => 'manual' as const),
    status: text('status', { enum: ['running', 'success', 'failed'] })
      .notNull()
      .$default(() => 'running' as const),

    /** Where the file was written or shared to, as far as the app can tell. */
    destination: text('destination'),
    fileName: text('file_name'),
    sizeBytes: integer('size_bytes'),
    /** SHA-256 of the encrypted archive, so a restore can prove integrity. */
    checksum: text('checksum'),
    includesMedia: bool('includes_media')
      .notNull()
      .$default(() => true),
    isEncrypted: bool('is_encrypted')
      .notNull()
      .$default(() => true),
    rowCounts: text('row_counts', { mode: 'json' }).$type<Record<string, number>>(),
    schemaVersion: integer('schema_version'),
    errorText: text('error_text'),
  },
  (t) => [index('backup_runs_started_idx').on(t.startedAt)],
);

/* -------------------------------------------------------------------------- */
/*  Audit trail                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A light append-only log of destructive or sensitive actions: deletions,
 * restores, vault reveals, exports. Not a full clinical audit trail, but
 * enough to reconstruct "what happened to that record".
 */
export const auditLog = sqliteTable(
  'audit_log',
  {
    ...baseColumns,
    at: integer('at', { mode: 'timestamp_ms' }).notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    summary: text('summary'),
    detail: text('detail', { mode: 'json' }).$type<Record<string, unknown>>(),
  },
  (t) => [index('audit_log_at_idx').on(t.at), index('audit_log_entity_idx').on(t.entityType, t.entityId)],
);

export type Setting = typeof settings.$inferSelect;
export type BackupRun = typeof backupRuns.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
