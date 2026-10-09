import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { tablesOf } from '@/db/query-tables';
import { attachments, notes, patients, type NoteType } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { stamps } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { noteListCursor, NOTE_PAGE_SIZE, NOTE_PREVIEW_SIZE, type NoteListCursor } from './list-logic';
import {
  noteVoiceCountsQuery,
  patientHighlightedNotesQuery,
  patientNotePageQuery,
  patientNoteTypesQuery,
} from './list-queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase, patientId: string;
const at = new Date('2025-01-01T12:00:00Z');
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Paged notes' });
});
const note = (id: string, isPinned = false, noteDate = at, type: NoteType = 'progress') => {
  t.db
    .insert(notes)
    .values({ id, patientId, isPinned, noteDate, type, ...stamps(at) })
    .run();
};

describe('bounded patient note and highlight projections', () => {
  it('reads at most one short page and eight highlights from 2,000 long documents without changing their full text', () => {
    const body = 'Synthetic long history '.repeat(1000);
    t.db.transaction((tx) => {
      for (let i = 0; i < 2000; i++)
        tx.insert(notes)
          .values({
            id: `large-${String(i).padStart(4, '0')}`,
            patientId,
            type: 'event',
            noteDate: new Date(at.getTime() - i * 1000),
            body,
            title: 'T'.repeat(1000),
            specialty: 'S'.repeat(500),
            ...stamps(at),
          })
          .run();
    });
    const page = patientNotePageQuery(patientId).all();
    expect(page).toHaveLength(NOTE_PAGE_SIZE + 1);
    expect(
      page.every(
        (n) => n.preview?.length === NOTE_PREVIEW_SIZE + 1 && n.title?.length === 161 && n.specialty?.length === 97,
      ),
    ).toBe(true);
    expect(page[0]).not.toHaveProperty('body');
    expect(page[0]).not.toHaveProperty('searchText');
    expect(JSON.stringify(page).length).toBeLessThan(33000);
    expect(patientHighlightedNotesQuery(patientId).all()).toHaveLength(8);
    expect(t.db.select({ body: notes.body }).from(notes).where(eq(notes.id, page[0]!.id)).get()?.body).toBe(body);
    expect(
      patientNotePageQuery(patientId, 'all', { pinned: false, at: at.getTime() - 1979 * 1000, id: 'large-1979' }).all(),
    ).toHaveLength(20);
  });

  it('pages pins, dates and ID ties without losing or duplicating records, independent of insertion order', () => {
    const expected: { id: string; isPinned: boolean; noteDate: Date }[] = [];
    for (let i = 159; i >= 0; i--) {
      const row = {
        id: `tie-${String(i).padStart(3, '0')}`,
        isPinned: i % 3 === 0,
        noteDate: new Date(at.getTime() - (i % 4) * 1000),
      };
      note(row.id, row.isPinned, row.noteDate);
      expected.push(row);
    }
    expected.sort(
      (a, b) =>
        Number(b.isPinned) - Number(a.isPinned) ||
        b.noteDate.getTime() - a.noteDate.getTime() ||
        a.id.localeCompare(b.id),
    );
    const seen: string[] = [];
    let cursor: NoteListCursor | undefined;
    for (let i = 0; i < 10; i++) {
      const candidates = patientNotePageQuery(patientId, 'all', cursor).all();
      const page = candidates.slice(0, NOTE_PAGE_SIZE);
      seen.push(...page.map((n) => n.id));
      if (candidates.length <= NOTE_PAGE_SIZE) break;
      cursor = noteListCursor(page.at(-1)!);
    }
    expect(seen).toEqual(expected.map((n) => n.id));
    expect(new Set(seen).size).toBe(160);
    // Highlights preserve pin priority; an old pin does not disappear behind recent events.
    note('old-pin', true, new Date(0));
    const highlights = patientHighlightedNotesQuery(patientId).all();
    expect(highlights).toHaveLength(8);
    expect(highlights.every((n) => n.isPinned)).toBe(true);
  });

  it('offers types outside the first page and applies their filter before limiting candidates', () => {
    for (let i = 0; i < 65; i++) note(`recent-${i}`, false, new Date(at.getTime() - i));
    note('older-operation', false, new Date(0), 'operation');
    expect(
      patientNotePageQuery(patientId)
        .all()
        .some((n) => n.type === 'operation'),
    ).toBe(false);
    expect(
      patientNoteTypesQuery(patientId)
        .all()
        .map((n) => n.type)
        .sort(),
    ).toEqual(['operation', 'progress']);
    expect(
      patientNotePageQuery(patientId, 'operation')
        .all()
        .map((n) => n.id),
    ).toEqual(['older-operation']);
  });

  it('keeps the next cursor page stable after a new first-page note and an earlier deletion', () => {
    for (let i = 0; i < 85; i++) note(`row-${String(i).padStart(3, '0')}`, false, new Date(at.getTime() - i));
    const first = patientNotePageQuery(patientId).all().slice(0, NOTE_PAGE_SIZE);
    note('newer', false, new Date(at.getTime() + 1000));
    t.db.update(notes).set({ deletedAt: at }).where(eq(notes.id, 'row-010')).run();
    const next = patientNotePageQuery(patientId, 'all', noteListCursor(first.at(-1)!))
      .all()
      .slice(0, NOTE_PAGE_SIZE);
    expect(next.map((n) => n.id)).toEqual(
      Array.from({ length: 40 }, (_, i) => `row-${String(40 + i).padStart(3, '0')}`),
    );
  });

  it('matches body/SOAP preview precedence, separators and truncation without modifying source fields', () => {
    note('soap');
    t.db
      .update(notes)
      .set({ body: '', subjective: 'S', objective: '', assessment: null, plan: ' P ' })
      .where(eq(notes.id, 'soap'))
      .run();
    expect(patientNotePageQuery(patientId).get()?.preview).toBe('S —  P ');
    t.db
      .update(notes)
      .set({ subjective: 's'.repeat(200), objective: 'o'.repeat(200), body: '' })
      .where(eq(notes.id, 'soap'))
      .run();
    expect(patientNotePageQuery(patientId).get()?.preview).toBe('s'.repeat(200) + ' — ' + 'o'.repeat(117) + '…');
    t.db
      .update(notes)
      .set({ body: 'b'.repeat(320) })
      .where(eq(notes.id, 'soap'))
      .run();
    expect(patientNotePageQuery(patientId).get()?.preview).toBe('b'.repeat(320));
    t.db
      .update(notes)
      .set({ body: 'b'.repeat(321) })
      .where(eq(notes.id, 'soap'))
      .run();
    expect(patientNotePageQuery(patientId).get()?.preview).toBe('b'.repeat(320) + '…');
  });

  it('excludes other/deleted notes and a deleted patient, including the type/highlight projections', async () => {
    note('alive-event', false, at, 'event');
    note('deleted', false, at, 'operation');
    t.db.update(notes).set({ deletedAt: at }).where(eq(notes.id, 'deleted')).run();
    const other = await createPatient({ firstName: 'Other', lastName: 'Synthetic' });
    t.db
      .insert(notes)
      .values({ id: 'other', patientId: other, type: 'discharge', noteDate: at, ...stamps(at) })
      .run();
    expect(
      patientNotePageQuery(patientId)
        .all()
        .map((n) => n.id),
    ).toEqual(['alive-event']);
    expect(patientNoteTypesQuery(patientId).all()).toEqual([{ type: 'event' }]);
    t.db.update(patients).set({ deletedAt: at }).where(eq(patients.id, patientId)).run();
    expect(patientNotePageQuery(patientId).all()).toEqual([]);
    expect(patientNoteTypesQuery(patientId).all()).toEqual([]);
    expect(patientHighlightedNotesQuery(patientId).all()).toEqual([]);
  });

  it('counts only live voices for visible notes, without transferring full attachment records', () => {
    note('visible');
    note('off-page');
    const media = (id: string, extra: Partial<typeof attachments.$inferInsert> = {}) =>
      t.db
        .insert(attachments)
        .values({
          id,
          entityType: 'note',
          entityId: 'visible',
          patientId,
          kind: 'voice',
          relativePath: `media/synthetic/${id}.m4a`,
          transcript: 'Long transcript '.repeat(500),
          ...stamps(at),
          ...extra,
        })
        .run();
    media('one');
    media('two');
    media('deleted', { deletedAt: at });
    media('photo', { kind: 'photo' });
    media('elsewhere', { entityId: 'off-page' });
    media('draft', { entityType: 'note_draft' });
    media('other-owner', { patientId: 'synthetic-other' });
    expect(noteVoiceCountsQuery(patientId, ['visible']).all()).toEqual([{ noteId: 'visible', count: 2 }]);
    expect(noteVoiceCountsQuery(patientId, []).all()).toEqual([]);
  });

  it('subscribes to real owner tables and media, so deletion/pins/voices refresh', () => {
    expect(tablesOf(patientNotePageQuery(patientId)).sort()).toEqual(['notes', 'patients']);
    expect(tablesOf(patientNoteTypesQuery(patientId)).sort()).toEqual(['notes', 'patients']);
    expect(tablesOf(patientHighlightedNotesQuery(patientId)).sort()).toEqual(['notes', 'patients']);
    expect(tablesOf(noteVoiceCountsQuery(patientId, ['synthetic'])).sort()).toEqual(['attachments']);
  });
});
