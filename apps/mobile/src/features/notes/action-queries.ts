import { and, eq, sql } from 'drizzle-orm';

import type { DbTransaction } from '@/db/client';
import { auditLog, notes, noteVersions, patients } from '@/db/schema';

/** Every lifecycle event is retained, including same-millisecond delete/restore. */
export const noteLifecycle = sql<string>`(select cast(count(*) as text) from ${auditLog}
  where ${auditLog.entityType} = 'note' and ${auditLog.entityId} = ${notes.id}
  and ${auditLog.action} in ('note.deleted', 'note.restored'))`;

// Ordinary corrections write an immutable version, even if the wall clock does
// not advance. A card needs this identity, not an unbounded copy of its body.
const versionId = sql<string | null>`(select ${noteVersions.id} from ${noteVersions}
    where ${noteVersions.noteId} = ${notes.id}
    order by ${noteVersions.createdAt} desc, ${noteVersions.id} desc limit 1)`;
/** Ephemeral exact SQLite tuple, never a stored draft or backup format. */
export const noteActionStamp = sql<string>`json_array(${notes.id}, ${notes.encounterId},
  cast(${notes.createdAt} as text), cast(${notes.updatedAt} as text), ${versionId}, ${noteLifecycle})`;
export type NoteActionBasis = { patientId: string; stamp: string };

/** Immediate internal writers may omit a token; retained UI actions must carry it. */
export function requireNoteAction(tx: DbTransaction, id: string, expected?: NoteActionBasis): void {
  if (!expected) return;
  // A join also prevents Drizzle's single-table projection optimization from
  // stripping the qualified outer-note columns inside correlated subqueries.
  const actual = tx
    .select({ stamp: noteActionStamp })
    .from(notes)
    .innerJoin(patients, eq(patients.id, notes.patientId))
    .where(and(eq(notes.id, id), eq(notes.patientId, expected.patientId)))
    .get();
  if (!actual || actual.stamp !== expected.stamp)
    throw new Error('این نوت تغییر کرده است؛ فهرست را دوباره بخوانید و نسخهٔ جدید را بررسی کنید.');
}
