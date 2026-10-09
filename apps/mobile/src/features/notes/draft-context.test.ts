import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { auditLog, encounters, noteDrafts, notes, noteVersions } from '@/db/schema';
import { openEncounter } from '@/features/encounters/queries';
import { createPatient } from '@/features/patients/queries';
import { datasetGeneration, reserveDatasetReplacement } from '@/lib/dataset-write';
import { dateInputText } from '@/lib/date-input';
import { softDelete } from '@/lib/ids';
import { formatClock } from '@/lib/time';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { commitNoteDraft } from './commit-queries';
import {
  decodeNoteOrigin,
  initialNoteOrigin,
  matchesNoteOrigin,
  noteBasis,
  noteDraftDate,
  noteDateInput,
} from './draft-context';
import {
  adoptNoteDraftOrigin,
  discardNoteDraft,
  inspectNoteDraft,
  writeNoteDraft,
  type NoteDraftFields,
} from './draft-queries';
import { createNote, noteQuery, updateNote } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase, patientId: string;
const fields: NoteDraftFields = {
  type: 'general',
  title: null,
  body: 'Recovered unfinished words',
  subjective: null,
  objective: null,
  assessment: null,
  plan: null,
  noteDate: new Date('2026-01-01T10:00:00Z'),
  doctorId: null,
  specialty: null,
  isPinned: false,
  isDraft: false,
  voices: [],
};
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Draft origin' });
});
const stored = () => ({
  notes: t.db.select().from(notes).all(),
  versions: t.db.select().from(noteVersions).all(),
  drafts: t.db.select().from(noteDrafts).all(),
  audits: t.db.select().from(auditLog).all(),
});
const draft = () => t.db.select().from(noteDrafts).get()!;

describe('a recovered note draft keeps the context in which it was written', () => {
  it('does not silently attach an outpatient draft to a later admission', async () => {
    await writeNoteDraft('origin-draft', { patientId, noteId: null }, fields);
    await openEncounter({ patientId, kind: 'admission', admittedAt: new Date('2026-02-01T10:00:00Z') });
    const id = await commitNoteDraft('origin-draft');
    expect(t.db.select().from(notes).where(eq(notes.id, id)).get()!.encounterId).toBeNull();
  });

  it('does not overwrite a correction simply because the editor reopened with its newer basis', async () => {
    const id = await createNote({ patientId, type: 'general', body: 'Original published words' });
    await writeNoteDraft('origin-draft', { patientId, noteId: id }, fields);
    await updateNote(id, { body: 'Newer published correction' });
    const reopened = (await noteQuery(id, patientId))[0]!;
    await expect(commitNoteDraft('origin-draft', datasetGeneration(), reopened)).rejects.toThrow();
    expect((await noteQuery(id, patientId))[0]!.body).toBe('Newer published correction');
    expect(t.db.select().from(noteDrafts).get()!.body).toBe(fields.body);
    expect(t.db.select().from(noteDrafts).get()!.deletedAt).toBeNull();
  });

  it('retains a known original admission after it closes and another opens', async () => {
    const original = await openEncounter({ patientId, kind: 'admission' });
    await writeNoteDraft('origin-draft', { patientId, noteId: null }, fields);
    await openEncounter({ patientId, kind: 'admission' });
    const id = await commitNoteDraft('origin-draft');
    expect((await noteQuery(id, patientId))[0]!.encounterId).toBe(original);
  });

  it('keeps the shown null context even when admission opens before the first autosave', async () => {
    const origin = initialNoteOrigin(patientId, null, null);
    await openEncounter({ patientId, kind: 'admission' });
    await writeNoteDraft('origin-draft', { patientId, noteId: null, origin, revision: 0 }, fields);
    const id = await commitNoteDraft('origin-draft');
    expect((await noteQuery(id, patientId))[0]!.encounterId).toBeNull();
  });

  it.each(['deleted', 'foreign'] as const)('refuses a %s original encounter without retiring input', async (kind) => {
    const encounterId = await openEncounter({ patientId, kind: 'admission' });
    await writeNoteDraft('origin-draft', { patientId, noteId: null }, fields);
    if (kind === 'deleted') t.db.update(encounters).set(softDelete()).where(eq(encounters.id, encounterId)).run();
    else {
      const other = await createPatient({ firstName: 'Synthetic', lastName: 'Other encounter owner' });
      t.db.update(encounters).set({ patientId: other }).where(eq(encounters.id, encounterId)).run();
    }
    const before = stored();
    await expect(commitNoteDraft('origin-draft')).rejects.toThrow();
    expect(stored()).toEqual(before);
  });

  it('retains its persisted basis across later text autosaves and same-timestamp clinical changes', async () => {
    const id = await createNote({ patientId, type: 'general', body: 'Initial note' });
    await writeNoteDraft('origin-draft', { patientId, noteId: id }, fields);
    const origin = draft().origin;
    t.db.update(notes).set({ body: 'Same-time correction' }).where(eq(notes.id, id)).run();
    await writeNoteDraft('origin-draft', { patientId, noteId: id }, { ...fields, body: 'More recovered text' });
    expect(draft().origin).toBe(origin);
    await expect(commitNoteDraft('origin-draft')).rejects.toThrow();
    expect((await noteQuery(id, patientId))[0]!.body).toBe('Same-time correction');
    expect(draft().body).toBe('More recovered text');
  });

  it('an ordinary writer cannot silently rebase its stored origin', async () => {
    const id = await createNote({ patientId, type: 'general', body: 'Before' });
    await writeNoteDraft('origin-draft', { patientId, noteId: id }, fields);
    await updateNote(id, { body: 'After' });
    const origin = initialNoteOrigin(patientId, (await noteQuery(id, patientId))[0]!, null);
    const before = stored();
    await expect(writeNoteDraft('origin-draft', { patientId, noteId: id, origin }, fields)).rejects.toThrow();
    expect(stored()).toEqual(before);
  });

  it('raw revision checks refuse another writer and publication of a different acknowledged draft', async () => {
    const first = await writeNoteDraft('origin-draft', { patientId, noteId: null, revision: 0 }, fields);
    const second = await writeNoteDraft(
      'origin-draft',
      { patientId, noteId: null, revision: first },
      { ...fields, body: 'Other raw writer' },
    );
    const before = stored();
    await expect(
      writeNoteDraft('origin-draft', { patientId, noteId: null, revision: first }, fields),
    ).rejects.toThrow();
    await expect(commitNoteDraft('origin-draft', datasetGeneration(), undefined, new Date(), first)).rejects.toThrow();
    await expect(discardNoteDraft('origin-draft', datasetGeneration(), first)).rejects.toThrow();
    expect(stored()).toEqual(before);
    const id = await commitNoteDraft('origin-draft', datasetGeneration(), undefined, new Date(), second);
    expect((await noteQuery(id, patientId))[0]!.body).toBe('Other raw writer');
  });

  it('legacy drafts remain unchanged until exact review; adoption changes raw metadata, not the chart', async () => {
    const id = await createNote({ patientId, type: 'general', body: 'Current published text' });
    await writeNoteDraft('origin-draft', { patientId, noteId: id }, fields);
    t.db.update(noteDrafts).set({ origin: null, revision: 0 }).run();
    await writeNoteDraft('origin-draft', { patientId, noteId: id }, fields);
    expect(draft().origin).toBeNull();
    await expect(commitNoteDraft('origin-draft')).rejects.toThrow();
    const shown = await inspectNoteDraft('origin-draft', patientId, id, datasetGeneration());
    const before = stored();
    await adoptNoteDraftOrigin(shown, datasetGeneration());
    expect(stored().notes).toEqual(before.notes);
    expect(stored().versions).toEqual(before.versions);
    expect(draft().body).toBe(fields.body);
    expect(matchesNoteOrigin(decodeNoteOrigin(draft().origin!), shown.note)).toBe(true);
    expect(stored().audits).toEqual([
      expect.objectContaining({ action: 'note.draftRebased', summary: null, detail: null }),
    ]);
    await expect(adoptNoteDraftOrigin(shown, datasetGeneration())).rejects.toThrow();
    await commitNoteDraft('origin-draft');
    expect((await noteQuery(id, patientId))[0]!.body).toBe(fields.body);
  });

  it('requires an unchanged explicitly shown destination for a legacy new draft', async () => {
    await writeNoteDraft('origin-draft', { patientId, noteId: null }, fields);
    t.db.update(noteDrafts).set({ origin: null }).run();
    const first = await openEncounter({ patientId, kind: 'admission' });
    const shown = await inspectNoteDraft('origin-draft', patientId, null, datasetGeneration());
    expect(shown.encounterId).toBe(first);
    await openEncounter({ patientId, kind: 'admission' });
    const before = stored();
    await expect(adoptNoteDraftOrigin(shown, datasetGeneration())).rejects.toThrow();
    expect(stored()).toEqual(before);
  });

  it.each(['draft', 'note', 'encounter'] as const)('refuses a changed shown %s before adoption', async (kind) => {
    const encounterId = await openEncounter({ patientId, kind: 'admission' });
    const id = await createNote({ patientId, type: 'general', body: 'Published comparison' });
    await writeNoteDraft('origin-draft', { patientId, noteId: id }, fields);
    const shown = await inspectNoteDraft('origin-draft', patientId, id, datasetGeneration());
    if (kind === 'draft')
      await writeNoteDraft('origin-draft', { patientId, noteId: id }, { ...fields, body: 'New raw comparison' });
    else if (kind === 'note') t.db.update(notes).set({ plan: 'New plan' }).where(eq(notes.id, id)).run();
    else t.db.update(encounters).set({ ward: 'Changed ward' }).where(eq(encounters.id, encounterId)).run();
    const before = stored();
    await expect(adoptNoteDraftOrigin(shown, datasetGeneration())).rejects.toThrow();
    expect(stored()).toEqual(before);
  });

  it('an audit failure rolls back rebase and local raw replacement, then a clean retry succeeds', async () => {
    const id = await createNote({ patientId, type: 'general', body: 'Current chart' });
    await writeNoteDraft('origin-draft', { patientId, noteId: id }, fields);
    const shown = await inspectNoteDraft('origin-draft', patientId, id, datasetGeneration());
    const before = stored();
    t.sqlite.exec(
      "CREATE TRIGGER fail_note_rebase BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(
      adoptNoteDraftOrigin(shown, datasetGeneration(), { ...fields, body: 'Local kept text' }),
    ).rejects.toThrow();
    expect(stored()).toEqual(before);
    t.sqlite.exec('DROP TRIGGER fail_note_rebase');
    const updated = await adoptNoteDraftOrigin(shown, datasetGeneration(), { ...fields, body: 'Local kept text' });
    expect(updated.body).toBe('Local kept text');
    expect((await noteQuery(id, patientId))[0]!.body).toBe('Current chart');
  });

  it('fences inspect, adoption, raw writing and publication with the originating dataset', async () => {
    await writeNoteDraft('origin-draft', { patientId, noteId: null }, fields);
    const token = datasetGeneration();
    const shown = await inspectNoteDraft('origin-draft', patientId, null, token);
    const replacement = reserveDatasetReplacement();
    replacement.committed();
    replacement.release();
    const before = stored();
    await expect(inspectNoteDraft('origin-draft', patientId, null, token)).rejects.toThrow();
    await expect(adoptNoteDraftOrigin(shown, token)).rejects.toThrow();
    await expect(writeNoteDraft('origin-draft', { patientId, noteId: null }, fields, token)).rejects.toThrow();
    await expect(commitNoteDraft('origin-draft', token)).rejects.toThrow();
    expect(stored()).toEqual(before);
  });
  it('a discard audit failure retains the complete draft and retries without duplicate acknowledgment', async () => {
    const revision = await writeNoteDraft('origin-draft', { patientId, noteId: null }, fields);
    const before = stored();
    t.sqlite.exec(
      "CREATE TRIGGER fail_note_discard BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(discardNoteDraft('origin-draft', datasetGeneration(), revision)).rejects.toThrow();
    expect(stored()).toEqual(before);
    t.sqlite.exec('DROP TRIGGER fail_note_discard');
    await discardNoteDraft('origin-draft', datasetGeneration(), revision);
    await discardNoteDraft('origin-draft', datasetGeneration(), revision);
    expect(draft().deletedAt).not.toBeNull();
    expect(stored().audits).toHaveLength(1);
  });

  it('preserves incomplete raw day/clock and refuses clinical publication until corrected', async () => {
    const rawDate = { dateText: '1404/10/', clockText: '2:', customOpen: true };
    await writeNoteDraft('origin-draft', { patientId, noteId: null }, { ...fields, rawDate });
    const before = stored();
    await expect(commitNoteDraft('origin-draft')).rejects.toThrow();
    expect(stored()).toEqual(before);
    expect(draft().rawDate).toEqual(rawDate);
    const corrected = new Date(2026, 0, 3, 11, 22);
    await writeNoteDraft(
      'origin-draft',
      { patientId, noteId: null },
      {
        ...fields,
        rawDate: { dateText: dateInputText(corrected), clockText: formatClock(corrected), customOpen: true },
      },
    );
    const id = await commitNoteDraft('origin-draft');
    expect((await noteQuery(id, patientId))[0]!.noteDate).toEqual(corrected);
  });

  it('does not truncate seconds when unchanged visible date/clock is published', () => {
    const date = new Date(2026, 0, 3, 11, 22, 33, 456);
    expect(
      noteDraftDate(
        { dateText: dateInputText(date), clockText: formatClock(date), customOpen: false },
        date,
        new Date(2026, 9, 9),
      ),
    ).toEqual(date);
  });
  it.each([false, 0, '', { dateText: false, clockText: '10:00', customOpen: true }])(
    'does not publish a falsy or malformed raw date as its previous parsed timestamp (%s)',
    async (rawDate) => {
      await writeNoteDraft(
        'origin-draft',
        { patientId, noteId: null },
        { ...fields, rawDate: rawDate as unknown as NoteDraftFields['rawDate'] },
      );
      const before = stored();
      await expect(commitNoteDraft('origin-draft')).rejects.toThrow();
      expect(stored()).toEqual(before);
    },
  );
  it.each([
    { dateText: 123, clockText: '10:00', customOpen: true },
    { dateText: {}, clockText: null },
    'bad raw shape',
  ])('keeps a corrupt imported raw shape visible and invalid (%s)', (raw) => {
    const input = noteDateInput(raw, fields.noteDate!);
    expect(input.dateText).toBe(JSON.stringify(raw));
    expect(() => noteDraftDate(input, fields.noteDate!, new Date(2026, 9, 9))).toThrow();
  });

  it('basis comparison is independent of object key order and fails for a same-time field change', async () => {
    const id = await createNote({ patientId, type: 'general', body: 'Exact basis' });
    const note = (await noteQuery(id, patientId))[0]!;
    const shuffled = Object.fromEntries(Object.entries(note).reverse()) as typeof note;
    expect(noteBasis(shuffled)).toBe(noteBasis(note));
    expect(noteBasis({ ...note, authorName: 'Synthetic changed author' })).not.toBe(noteBasis(note));
  });

  it.each(['{"version":9}', 'private synthetic words', '{"version":1,"patientId":"other"}'])(
    'malformed origin is not guessed or leaked (%s)',
    async (origin) => {
      await writeNoteDraft('origin-draft', { patientId, noteId: null }, fields);
      t.db.update(noteDrafts).set({ origin }).run();
      const before = stored();
      await expect(commitNoteDraft('origin-draft')).rejects.toThrow();
      expect(stored()).toEqual(before);
      expect(() => decodeNoteOrigin(origin)).toThrow();
      try {
        decodeNoteOrigin(origin);
      } catch (e) {
        expect((e as Error).message).not.toContain(origin);
      }
    },
  );
});
