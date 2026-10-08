import type { NoteType } from '@/db/schema';

export type TimelineKind = 'encounter' | 'note' | 'lab' | 'imaging' | 'consult';
export type TimelineFilter = TimelineKind | 'all';
export type TimelineCursor = { at: number; id: string };
export const TIMELINE_PAGE_SIZE = 40;
export const TIMELINE_LAB_PREVIEW_SIZE = 6;

export type TimelineRow = {
  id: string;
  sourceId: string;
  kind: TimelineKind;
  at: Date | null;
  title: string | null;
  summary: string | null;
  noteType: NoteType | null;
};
export type TimelineItem = Omit<TimelineRow, 'at'> & {
  at: Date;
  results?: { shown: number; total: number };
};

/** Same binary id order as SQLite, including ties between the two encounter events. */
export function timelinePage(rows: readonly TimelineRow[]) {
  const valid: TimelineItem[] = [];
  let invalidDates = 0;
  for (const row of rows) {
    if (!row.at || !Number.isFinite(row.at.getTime())) {
      invalidDates += 1;
      continue;
    }
    valid.push({ ...row, at: row.at });
  }
  valid.sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { items: valid.slice(0, TIMELINE_PAGE_SIZE), hasMore: valid.length > TIMELINE_PAGE_SIZE, invalidDates };
}
export const timelineCursor = (item: TimelineItem): TimelineCursor => ({ at: item.at.getTime(), id: item.id });
