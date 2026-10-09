import type { NoteType } from '@/db/schema';

/** Card previews are not editable notes or revision-history snapshots. */
export const NOTE_PAGE_SIZE = 40;
export const NOTE_PREVIEW_SIZE = 320;

export type NoteListFilter = 'all' | NoteType;
export type NoteListCursor = { pinned: boolean; at: number; id: string };

export function noteListCursor(note: { isPinned: boolean; noteDate: Date; id: string }): NoteListCursor {
  return { pinned: note.isPinned, at: note.noteDate.getTime(), id: note.id };
}
