import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { CLINICAL_HISTORY_KINDS } from '@/lib/clinical-history';

import { baseColumns } from './_shared';
import { patients } from './patients';

/** Permanent, exact clinical snapshots. No automatic pruning or mutation API. */
export const clinicalVersions = sqliteTable(
  'clinical_versions',
  {
    ...baseColumns,
    kind: text('kind', { enum: CLINICAL_HISTORY_KINDS }).notNull(),
    recordId: text('record_id').notNull(),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    sequence: integer('sequence').notNull().default(1),
    recordedAt: integer('recorded_at', { mode: 'timestamp_ms' }).notNull(),
    reason: text('reason', { enum: ['created', 'edited', 'deleted', 'restored', 'baseline', 'reconciled'] }).notNull(),
    /** Version1 carries exact fields, date-column metadata and lab value snapshots. */
    body: text('body').notNull(),
  },
  (table) => [
    uniqueIndex('clinical_versions_record_sequence_idx').on(table.kind, table.recordId, table.sequence),
    index('clinical_versions_patient_time_idx').on(table.patientId, table.recordedAt, table.id),
  ],
);

export type ClinicalVersion = typeof clinicalVersions.$inferSelect;
