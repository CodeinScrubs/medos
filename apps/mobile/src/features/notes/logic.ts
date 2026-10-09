import type { Note, NoteType, NoteVersion } from '@/db/schema';
import { buildSearchText } from '@/lib/persian';

/** Exact shown-row equality, including clinical fields and Date milliseconds. */
export function sameNoteSnapshot<T extends Note | NoteVersion>(current: T, expected: T): boolean {
  return (Object.keys(current) as (keyof T)[]).every((key) => {
    const a = current[key],
      b = expected[key];
    return a instanceof Date || b instanceof Date
      ? a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
      : a === b;
  });
}

/** Note types written in SOAP form; everything else is a single free-text body. */
export const SOAP_NOTE_TYPES: readonly NoteType[] = ['admission', 'progress', 'outpatient_visit', 'consult_reply'];

/** Note types that involve another specialist. */
export const CONSULT_NOTE_TYPES: readonly NoteType[] = ['consult_request', 'consult_reply'];

/** Preview line for a note card: whichever body field actually has content. */
export function notePreview(note: Pick<Note, 'body' | 'subjective' | 'objective' | 'assessment' | 'plan'>): string {
  return note.body?.trim()
    ? note.body
    : [note.subjective, note.objective, note.assessment, note.plan].filter((value) => value?.trim()).join(' — ');
}

export function noteSearchText(
  note: Partial<Pick<Note, 'title' | 'body' | 'subjective' | 'objective' | 'assessment' | 'plan' | 'specialty'>>,
): string {
  return buildSearchText(
    note.title,
    note.body,
    note.subjective,
    note.objective,
    note.assessment,
    note.plan,
    note.specialty,
  );
}

/** Events and pinned notes are what the record's front page shows. */
export function isHighlighted(note: Pick<Note, 'type' | 'isPinned'>): boolean {
  return note.type === 'event' || note.isPinned;
}
