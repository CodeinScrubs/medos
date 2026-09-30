import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { baseColumns } from './_shared';
import { attachments } from './media';
import { notes, patients } from './patients';

/** One explicit import request. A retry reuses its id; intentional reimport uses a new id. */
export const callImports = sqliteTable(
  'call_imports',
  {
    ...baseColumns,
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    /** Versioned exact source metadata; never include it in diagnostics. */
    sourceBody: text('source_body').notNull(),
    relativePath: text('relative_path').notNull(),
    state: text('state', { enum: ['copying', 'ready', 'filed', 'discarding', 'discarded'] })
      .notNull()
      .default('copying'),
    revision: integer('revision').notNull().default(0),
    checksum: text('checksum'),
    sizeBytes: integer('size_bytes'),
    noteId: text('note_id').references(() => notes.id),
    attachmentId: text('attachment_id').references(() => attachments.id),
  },
  (t) => [
    uniqueIndex('call_imports_path_idx').on(t.relativePath),
    index('call_imports_pending_idx').on(t.state, t.deletedAt),
  ],
);

export type CallImport = typeof callImports.$inferSelect;
