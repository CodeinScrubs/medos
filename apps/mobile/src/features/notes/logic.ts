import type { Note, NoteType } from '@/db/schema';
import { buildSearchText } from '@/lib/persian';

/** Note types written in SOAP form; everything else is a single free-text body. */
export const SOAP_NOTE_TYPES: readonly NoteType[] = ['admission', 'progress', 'outpatient_visit', 'consult_reply'];

/** Note types that involve another specialist. */
export const CONSULT_NOTE_TYPES: readonly NoteType[] = ['consult_request', 'consult_reply'];

/** Preview line for a note card: whichever body field actually has content. */
export function notePreview(note: Pick<Note, 'body' | 'subjective' | 'objective' | 'assessment' | 'plan'>): string {
  return note.body || [note.subjective, note.objective, note.assessment, note.plan].filter(Boolean).join(' — ');
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
