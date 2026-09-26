import { db } from '@/db/client';
import { readSetting, writeSetting } from '@/db/settings';
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
  recordedAt: Date;
  who: string | null;
  /** `recordingKey(name, sizeBytes)`. */
  key: string;
};

/**
 * File a call under a patient: a «پیگیری تلفنی» note dated when the call was
 * recorded, with the recording attached as its voice note.
 *
 * The audio is copied into MedOS's own storage first — so it is in the
 * backups, and deleting it from the dialer's folder later loses nothing — and
 * only then are the note and the attachment written, together. A failed write
 * removes the copy it made. The note starts empty on purpose: what was said
 * is the physician's to write, and the screen opens it for that.
 */
export async function fileCallRecording(patientId: string, recording: CallRecording): Promise<string> {
  const stored = await storeFile(recording.uri, extensionOf(recording.name, 'm4a'));
  let noteId: string;
  try {
    noteId = db.transaction((tx) => {
      const id = createNoteInTransaction(tx, {
        patientId,
        type: 'phone_followup',
        title: recording.who ? `تماس — ${recording.who}` : 'تماس',
        noteDate: recording.recordedAt,
      });
      addAttachmentInTransaction(tx, {
        entityType: 'note',
        entityId: id,
        patientId,
        kind: 'voice',
        relativePath: stored.relativePath,
        sizeBytes: stored.sizeBytes,
        mimeType: recordingMimeType(recording.name),
        caption: 'ضبط تماس',
        capturedAt: recording.recordedAt,
      });
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
  await markFiled(recording.key);
  return noteId;
}

async function markFiled(key: string): Promise<void> {
  const filed = await readSetting(callsFiled);
  if (filed.includes(key)) return;
  await writeSetting(callsFiled, [...filed, key].slice(-CALLS_FILED_LIMIT));
}
