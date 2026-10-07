import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { attachments, noteDrafts, notes, patients } from '@/db/schema';
import { addAttachmentInTransaction } from '@/features/attachments/queries';
import { assertDatasetWrite, datasetGeneration } from '@/lib/dataset-write';
import { softDelete, touch } from '@/lib/ids';

import { draftHasContent, draftVoiceRowsInTransaction, requireNoPendingDraftRecording } from './draft-queries';
import { createNoteInTransaction, updateNoteInTransaction } from './queries';

/** Publish the persisted draft, its history and voice metadata as one operation. */
export async function commitNoteDraft(draftId: string, generation = datasetGeneration()): Promise<string> {
  assertDatasetWrite(generation);
  return db.transaction((tx) => {
    const draft = tx
      .select()
      .from(noteDrafts)
      .where(and(eq(noteDrafts.id, draftId), isNull(noteDrafts.deletedAt)))
      .get();
    if (!draft) throw new Error('No saved draft to commit');
    requireNoPendingDraftRecording(tx, draftId);
    const voices = draftVoiceRowsInTransaction(tx, draftId);
    if (!draftHasContent(draft) && !voices.length) throw new Error('No saved draft to commit');
    for (const voice of voices) {
      if (
        draft.noteId ||
        voice.kind !== 'voice' ||
        voice.patientId !== draft.patientId ||
        !voice.checksum ||
        !/^[0-9a-f]{64}$/.test(voice.checksum) ||
        !Number.isSafeInteger(voice.sizeBytes) ||
        (voice.sizeBytes ?? 0) <= 0 ||
        !Number.isSafeInteger(voice.durationMs) ||
        (voice.durationMs ?? 0) < 500 ||
        !voice.capturedAt ||
        !Number.isFinite(voice.capturedAt.getTime()) ||
        (draft.voices ?? []).some((legacy) => legacy.relativePath === voice.relativePath)
      )
        throw new Error('وضعیت وویس پیش‌نویس با مقصد یکسان نیست؛ نوت ثبت نشد.');
    }
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
      if (voice.capturedAt !== undefined && typeof voice.capturedAt !== 'string')
        throw new Error('زمان ضبط وویس معتبر نیست؛ نوت ثبت نشد.');
      const capturedAt = voice.capturedAt === undefined ? draft.updatedAt : new Date(voice.capturedAt);
      if (!Number.isFinite(capturedAt.getTime())) throw new Error('زمان ضبط وویس معتبر نیست؛ نوت ثبت نشد.');
      addAttachmentInTransaction(tx, {
        entityType: 'note',
        entityId: noteId,
        patientId: draft.patientId,
        kind: 'voice',
        relativePath: voice.relativePath,
        sizeBytes: voice.sizeBytes,
        mimeType: 'audio/mp4',
        durationMs: voice.durationMs,
        capturedAt,
      });
    }
    // Only the parent changes. Path, checksum, original time and journal receipt stay immutable.
    for (const voice of voices) {
      tx.update(attachments)
        .set({ entityType: 'note', entityId: noteId, ...touch() })
        .where(eq(attachments.id, voice.id))
        .run();
    }
    tx.update(noteDrafts)
      .set({ noteId, ...softDelete() })
      .where(eq(noteDrafts.id, draftId))
      .run();
    return noteId;
  });
}
