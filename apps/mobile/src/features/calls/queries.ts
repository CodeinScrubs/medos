import { and, eq, isNull } from 'drizzle-orm';

import { db, type DbTransaction } from '@/db/client';
import { patients, settings } from '@/db/schema';
import { parseSetting } from '@/db/settings';
import { addAttachmentInTransaction } from '@/features/attachments/queries';
import { createNoteInTransaction } from '@/features/notes/queries';
import { extensionOf, mediaFile, storeFile } from '@/platform/media';

import { recordingMimeType } from './logic';
import { callsFiled, CALLS_FILED_LIMIT } from './settings';

export type CallRecording = {
  /** Where the dialer left it: a content URI in the chosen folder, or a picked file. */
  uri: string;
  name: string;
  sizeBytes: number | null;
  recordedAt: Date | null;
  timeSource: 'filename' | 'file' | 'unknown';
  who: string | null;
  /** `recordingKey(name)`; a display hint, not a unique import identity. */
  key: string;
};

/**
 * File a call under a patient: a «پیگیری تلفنی» note dated when the call was
 * recorded, with the recording attached as its voice note.
 *
 * The audio is copied into MedOS's own storage first — so it is in the
 * backups, and deleting it from the dialer's folder later loses nothing — and
 * only then are the note, attachment and filed marker written together. A failed write
 * removes the copy it made. An unknown or file-derived time is explained in
 * the note; the clinical content is the physician's to write.
 */
export async function fileCallRecording(
  patientId: string,
  recording: CallRecording,
  now: Date = new Date(),
): Promise<string> {
  const time = recording.recordedAt;
  const hasTime = time != null && Number.isFinite(time.getTime()) && recording.timeSource !== 'unknown';
  const noteDate = hasTime ? time : now;
  const timeNote = !hasTime
    ? 'زمان تماس مشخص نیست؛ تاریخ نوت، زمان ورود فایل است.'
    : recording.timeSource === 'file'
      ? 'تاریخ نوت از زمان فایل گرفته شده؛ زمان تماس تأیید نشده است.'
      : null;
  const stored = await storeFile(recording.uri, extensionOf(recording.name, 'm4a'));
  try {
    return db.transaction((tx) => {
      // The picker may be stale by the time a provider finishes copying the audio.
      const patient = tx
        .select({ id: patients.id })
        .from(patients)
        .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
        .get();
      if (!patient) throw new Error('بیمار در دسترس نیست؛ فایل وارد نشد.');
      const id = createNoteInTransaction(tx, {
        patientId,
        // An imported call is not evidence that it belongs to today's admission.
        encounterId: null,
        type: 'phone_followup',
        title: recording.who ? `تماس — ${recording.who}` : 'تماس',
        noteDate,
        body: timeNote,
      });
      addAttachmentInTransaction(tx, {
        entityType: 'note',
        entityId: id,
        patientId,
        kind: 'voice',
        relativePath: stored.relativePath,
        sizeBytes: stored.sizeBytes,
        mimeType: recordingMimeType(recording.name),
        caption: !hasTime
          ? 'ضبط تماس؛ زمان ورود فایل'
          : recording.timeSource === 'file'
            ? 'ضبط تماس؛ زمان فایل'
            : 'ضبط تماس؛ زمان از نام فایل',
        capturedAt: noteDate,
      });
      markFiled(tx, recording.key, now);
      return id;
    });
  } catch (error) {
    try {
      mediaFile(stored.relativePath).delete();
    } catch {
      // An orphaned copy is wasted space, not lost data; the write error is what matters.
    }
    throw error;
  }
}

function markFiled(tx: DbTransaction, key: string, updatedAt: Date): void {
  const filed = parseSetting(callsFiled, tx.select().from(settings).where(eq(settings.key, callsFiled.key)).get());
  if (filed.includes(key)) return;
  const value = JSON.stringify(callsFiled.schema.parse([...filed, key].slice(-CALLS_FILED_LIMIT)));
  tx.insert(settings)
    .values({ key: callsFiled.key, value, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } })
    .run();
}
