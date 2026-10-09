import { newId, stamps } from '@/lib/ids';

import { db, type Database, type DbTransaction } from './client';
import { auditLog } from './schema';

/**
 * An append-only record of the actions that matter after the fact: deletions,
 * restores, backups, schema migrations, security changes. It answers "what
 * happened to that record, and when" without trusting memory.
 */
export type AuditAction =
  | 'patient.deleted'
  | 'patient.restored'
  | 'capture.restored'
  | 'patient.draftDiscarded'
  | 'contact.draftDiscarded'
  | 'call.importDiscarded'
  | 'recording.discarded'
  | 'attachment.deleted'
  | 'attachment.captionDraftDiscarded'
  | 'imaging.deleted'
  | 'imaging.draftDiscarded'
  | 'doctor.draftDiscarded'
  | 'photo_import.discarded'
  | 'image.editPublished'
  | 'image.draftDiscarded'
  | 'image.draftResolved'
  | 'vital.updated'
  | 'vital.deleted'
  | 'vital.draftDiscarded'
  | 'diagnosis.updated'
  | 'diagnosis.deleted'
  | 'order.statusChanged'
  | 'order.deleted'
  | 'encounter.discharged'
  | 'encounter.deleted'
  | 'encounter.draftDiscarded'
  | 'note.deleted'
  | 'note.restored'
  | 'note.draftDiscarded'
  | 'task.deleted'
  | 'task.restored'
  | 'task.statusChanged'
  | 'consult.statusChanged'
  | 'consult.deleted'
  | 'followup.statusChanged'
  | 'followup.deleted'
  | 'followup.draftDiscarded'
  | 'lab.draftDiscarded'
  | 'occasion.deleted'
  | 'occasion.draftDiscarded'
  | 'greeting.sentConfirmed'
  | 'greeting.skipped'
  | 'doctor.deleted'
  | 'backup.created'
  | 'backup.restored'
  // A restore that was cut short and had its files put back.
  | 'backup.restoreRolledBack'
  | 'db.migrated'
  | 'lock.enabled'
  | 'lock.disabled'
  | 'search.reindexed'
  // Final autosave on the original removed membership; never revive it or log text.
  | 'shift.textRecovered'
  // Stored H/L flags worked out again after a change to the rule.
  | 'labs.reflagged'
  // A patient's status put back in step with their episodes.
  | 'patient.statusReconciled'
  // Notes written before the history table got their first version.
  | 'note.versionsBackfilled'
  // The vault records that a credential was written or read, never its value.
  | 'vault.created'
  | 'vault.updated'
  | 'vault.revealed'
  | 'vault.deleted'
  | 'vault.rekeyed';

type AuditDetails = {
  entityType?: string;
  entityId?: string;
  summary?: string;
  detail?: Record<string, unknown>;
};

function auditValues(action: AuditAction, details: AuditDetails, now: Date) {
  return {
    id: newId(),
    ...stamps(now),
    at: now,
    action,
    entityType: details.entityType ?? null,
    entityId: details.entityId ?? null,
    summary: details.summary ?? null,
    detail: details.detail ?? null,
  };
}

/** The caller's synchronous transaction rolls back if this record cannot be written. */
export function auditInTransaction(tx: DbTransaction, action: AuditAction, details: AuditDetails, now: Date): void {
  tx.insert(auditLog)
    .values(auditValues(action, details, now))
    .run();
}

export async function audit(action: AuditAction, details: AuditDetails = {}, database: Database = db): Promise<void> {
  try {
    await database.insert(auditLog).values(auditValues(action, details, new Date()));
  } catch {
    // Auditing must never break the action it is recording.
  }
}
