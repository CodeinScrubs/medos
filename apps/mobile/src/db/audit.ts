import { newId, stamps } from '@/lib/ids';

import { db } from './client';
import { auditLog } from './schema';

/**
 * An append-only record of the actions that matter after the fact: deletions,
 * restores, backups, schema migrations, security changes. It answers "what
 * happened to that record, and when" without trusting memory.
 */
export type AuditAction =
  | 'patient.deleted'
  | 'patient.restored'
  | 'attachment.deleted'
  | 'backup.created'
  | 'backup.restored'
  | 'db.migrated'
  | 'lock.enabled'
  | 'lock.disabled'
  | 'search.reindexed'
  // The vault records that a credential was written or read, never its value.
  | 'vault.created'
  | 'vault.updated'
  | 'vault.revealed'
  | 'vault.deleted'
  | 'vault.rekeyed';

export async function audit(
  action: AuditAction,
  details: {
    entityType?: string;
    entityId?: string;
    summary?: string;
    detail?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const now = new Date();
  try {
    await db.insert(auditLog).values({
      id: newId(),
      ...stamps(now),
      at: now,
      action,
      entityType: details.entityType ?? null,
      entityId: details.entityId ?? null,
      summary: details.summary ?? null,
      detail: details.detail ?? null,
    });
  } catch {
    // Auditing must never break the action it is recording.
  }
}
