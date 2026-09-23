import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { noteDrafts, notes, patients } from '@/db/schema';
import { addAttachmentInTransaction } from '@/features/attachments/queries';
import { softDelete } from '@/lib/ids';

import { draftHasContent } from './draft-queries';
import { createNoteInTransaction, updateNoteInTransaction } from './queries';

/** Publish the persisted draft, its history and voice metadata as one operation. */
export async function commitNoteDraft(draftId: string): Promise<string> {
  return db.transaction((tx) => {
    const draft = tx
      .select()
      .from(noteDrafts)
      .where(and(eq(noteDrafts.id, draftId), isNull(noteDrafts.deletedAt)))
      .get();
    if (!draft || !draftHasContent(draft)) throw new Error('No saved draft to commit');
    if (
      !tx
        .select({ id: patients.id })
        .from(patients)
        .where(and(eq(patients.id, draft.patientId), isNull(patients.deletedAt)))
        .get()
    ) {
      throw new Error('Patient not found');
    }
    const fields = {
      type: draft.type,
      title: draft.title,
      body: draft.body,
      subjective: draft.subjective,
      objective: draft.objective,
      assessment: draft.assessment,
      plan: draft.plan,
      noteDate: draft.noteDate ?? draft.createdAt,
      doctorId: draft.doctorId,
      specialty: draft.specialty,
      isPinned: draft.isPinned ?? false,
      isDraft: draft.isDraft ?? false,
    };
    let noteId = draft.noteId;
    if (noteId) {
      const current = tx
        .select({ patientId: notes.patientId })
        .from(notes)
        .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
        .get();
      if (!current || current.patientId !== draft.patientId) throw new Error('Draft target does not match the note');
      updateNoteInTransaction(tx, noteId, fields);
    } else {
      noteId = createNoteInTransaction(tx, { patientId: draft.patientId, ...fields });
    }
    for (const voice of draft.voices ?? []) {
      addAttachmentInTransaction(tx, {
        entityType: 'note',
        entityId: noteId,
        patientId: draft.patientId,
        kind: 'voice',
        relativePath: voice.relativePath,
        sizeBytes: voice.sizeBytes,
        mimeType: 'audio/mp4',
        durationMs: voice.durationMs,
        capturedAt: draft.updatedAt,
      });
    }
    tx.update(noteDrafts)
      .set({ noteId, ...softDelete() })
      .where(eq(noteDrafts.id, draftId))
      .run();
    return noteId;
  });
}
