import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { tablesOf } from '@/db/query-tables';
import { auditLog, doctors, ideas, topics, workspaceFormDrafts } from '@/db/schema';
import { createDoctor } from '@/features/doctors/queries';
import {
  discardWorkspaceDraft,
  inspectWorkspaceForm,
  publishWorkspaceDraft,
  replaceWorkspaceDraft,
  saveWorkspaceDraft,
  workspaceFormSeed,
  workspaceDraftsQuery,
} from '@/features/workspace-forms/queries';
import { datasetGeneration, DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';
import { formBasis, FormDraftConflict, formScope, UnsupportedFormDraft } from '@/lib/form-document';
import { softDelete, stamps } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { ideaFormCodec, topicFormCodec, topicFormDate } from './form-draft';
import { ideaFormPort, ideaFormQuery, topicFormPort, topicFormQuery } from './form-draft-queries';
import { createIdea } from './ideas-queries';
import { createTopic, topicsQuery, updateTopic } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase;
let generation: number;
const now = new Date('2026-01-02T10:00:00.123Z');
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  generation = datasetGeneration();
});
const draft = (id = 'raw') => t.db.select().from(workspaceFormDrafts).where(eq(workspaceFormDrafts.id, id)).get()!;
async function ideaDocument(recordId: string | null = null) {
  return workspaceFormSeed(ideaFormPort, (await ideaFormQuery(recordId))[0]!, recordId, now).document;
}
async function topicDocument(recordId: string | null = null) {
  return workspaceFormSeed(topicFormPort, (await topicFormQuery(recordId))[0]!, recordId, now).document;
}
const saveIdea = (document: Awaited<ReturnType<typeof ideaDocument>>, revision = 0, id = 'raw') =>
  saveWorkspaceDraft(ideaFormPort, id, document, revision, generation);
const publishIdea = (recordId: string | null, revision = 1, id = 'raw') =>
  publishWorkspaceDraft(ideaFormPort, id, recordId, revision, now, generation);

describe('shared raw storage with real migrated SQLite', () => {
  it('returns one explicit empty seed and watches both the target and draft tables', async () => {
    expect(await ideaFormQuery(null)).toEqual([{ scope: '[null,null]', record: null, draft: null }]);
    expect(tablesOf(ideaFormQuery(null)).sort()).toEqual(['ideas', 'workspace_form_drafts']);
    expect(tablesOf(topicFormQuery(null)).sort()).toEqual(['topics', 'workspace_form_drafts']);
  });
  it('writes exact partial fields independently of a published record and has an SQL revision default', async () => {
    const document = await ideaDocument();
    document.fields.body = ' \nraw words\n  ';
    expect(await saveIdea(document)).toBe(1);
    expect(ideaFormCodec.decode(draft().body)).toEqual(document);
    expect(t.db.select().from(ideas).all()).toEqual([]);
    expect(await saveIdea(document, 1)).toBe(1);
    t.db
      .insert(workspaceFormDrafts)
      .values({ id: 'default', ...stamps(), kind: 'topic', scope: formScope(null), body: '{}' })
      .run();
    expect(draft('default').revision).toBe(0);
  });
  it('publishes one new record, allows receipt retry and never permits a late raw writer to revive it', async () => {
    const document = await ideaDocument();
    document.fields.title = 'Synthetic creating';
    await saveIdea(document);
    const id = await publishIdea(null);
    expect(await publishIdea(null)).toBe(id);
    expect(t.db.select().from(ideas).all()).toHaveLength(1);
    await expect(saveIdea(document, 1)).rejects.toThrow(FormDraftConflict);
    expect((await ideaFormQuery(null))[0]?.draft).toBeNull();
  });
  it('refuses a revision overflow without changing raw, published or audit rows', async () => {
    const document = await ideaDocument();
    document.fields.title = 'Synthetic revision boundary';
    await saveIdea(document);
    t.db
      .update(workspaceFormDrafts)
      .set({ revision: Number.MAX_SAFE_INTEGER })
      .where(eq(workspaceFormDrafts.id, 'raw'))
      .run();
    const before = draft();
    document.fields.body = 'Later exact words';
    const shown = await inspectWorkspaceForm(ideaFormPort, 'raw', null, generation);
    await expect(saveIdea(document, Number.MAX_SAFE_INTEGER)).rejects.toThrow(FormDraftConflict);
    await expect(publishIdea(null, Number.MAX_SAFE_INTEGER)).rejects.toThrow(FormDraftConflict);
    await expect(replaceWorkspaceDraft(ideaFormPort, 'raw', document, shown, now, generation)).rejects.toThrow(
      FormDraftConflict,
    );
    await expect(discardWorkspaceDraft('idea', 'raw', null, Number.MAX_SAFE_INTEGER, now, generation)).rejects.toThrow(
      FormDraftConflict,
    );
    expect(draft()).toEqual(before);
    expect(t.db.select().from(ideas).all()).toEqual([]);
    expect(t.db.select().from(auditLog).all()).toEqual([]);
  });
  it.each(['not-retired', 'foreign-body', 'future-body', 'invalid-revision'])(
    'refuses a malformed %s receipt instead of claiming publication',
    async (problem) => {
      const document = await ideaDocument();
      document.fields.title = 'Synthetic publication receipt';
      await saveIdea(document);
      await publishIdea(null);
      const patch =
        problem === 'not-retired'
          ? { deletedAt: null }
          : problem === 'invalid-revision'
            ? { revision: -1 }
            : {
                body: JSON.stringify({
                  ...document,
                  ...(problem === 'future-body' ? { version: 2 } : { scope: '[null,"foreign"]' }),
                }),
              };
      t.db.update(workspaceFormDrafts).set(patch).where(eq(workspaceFormDrafts.id, 'raw')).run();
      const before = draft();
      await expect(publishIdea(null)).rejects.toThrow();
      expect(draft()).toEqual(before);
      expect(t.db.select().from(ideas).all()).toHaveLength(1);
      expect(t.db.select().from(auditLog).all()).toHaveLength(1);
    },
  );
  it('bounds recovery projections before reading full bodies and keeps malformed drafts reachable', async () => {
    for (let i = 0; i < 8; i++)
      t.db
        .insert(workspaceFormDrafts)
        .values({
          id: `paged-${i}`,
          ...stamps(now),
          kind: 'idea',
          recordId: `record-${i}`,
          scope: formScope(`record-${i}`),
          body:
            i === 0 ? 'incomplete json' : JSON.stringify({ fields: { title: `Raw ${i}`, body: 'x'.repeat(10000) } }),
        })
        .run();
    const first = await workspaceDraftsQuery('idea');
    expect(first.map((row) => row.id)).toEqual(['paged-7', 'paged-6', 'paged-5', 'paged-4']);
    expect(Object.keys(first[0]!).sort()).toEqual(['id', 'recordId', 'title', 'updatedAt']);
    t.db.update(workspaceFormDrafts).set(softDelete(now)).where(eq(workspaceFormDrafts.id, 'paged-5')).run();
    const second = await workspaceDraftsQuery('idea', first[2]!);
    expect(second.map((row) => row.id)).toEqual(['paged-4', 'paged-3', 'paged-2', 'paged-1']);
    const last = await workspaceDraftsQuery('idea', second[2]!);
    expect(last.map((row) => row.id)).toEqual(['paged-1', 'paged-0']);
    expect(last[1]!.title).toBeNull();
  });
  it('rolls back an explicit rebase or discard when its audit fails', async () => {
    const document = await ideaDocument();
    await saveIdea(document);
    const before = draft();
    const shown = await inspectWorkspaceForm(ideaFormPort, 'raw', null, generation);
    t.sqlite.exec(
      "CREATE TRIGGER refuse_raw_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END",
    );
    await expect(replaceWorkspaceDraft(ideaFormPort, 'raw', document, shown, now, generation)).rejects.toThrow();
    expect(draft()).toEqual(before);
    await expect(discardWorkspaceDraft('idea', 'raw', null, 1, now, generation)).rejects.toThrow();
    expect(draft()).toEqual(before);
  });
  it('keeps a literal imported new ID separate from the creating scope', async () => {
    t.db
      .insert(ideas)
      .values({ id: 'new', ...stamps(), title: 'Existing literal new' })
      .run();
    await saveIdea(await ideaDocument());
    await saveIdea(await ideaDocument('new'), 0, 'editing-new');
    expect(
      t.db
        .select()
        .from(workspaceFormDrafts)
        .all()
        .map((row) => row.scope)
        .sort(),
    ).toEqual(['[null,"new"]', '[null,null]']);
  });
  it('refuses a second creator or stale revision without replacing the acknowledged words', async () => {
    const document = await ideaDocument();
    document.fields.body = 'First writer';
    await saveIdea(document);
    const other = { ...document, fields: { ...document.fields, body: 'Second writer' } };
    await expect(saveIdea(other, 0, 'competing')).rejects.toThrow(FormDraftConflict);
    await expect(saveIdea(other, 0)).rejects.toThrow(FormDraftConflict);
    expect(ideaFormCodec.decode(draft().body).fields.body).toBe('First writer');
    expect(await saveIdea(other, 1)).toBe(2);
  });
  it('refuses changed origin, row identity and a foreign document inside an imported row', async () => {
    const id = await createIdea({ title: 'Published' });
    const document = await ideaDocument(id);
    await saveIdea(document);
    await expect(saveIdea({ ...document, basis: formBasis({ id, title: 'Invented basis' }) }, 1)).rejects.toThrow(
      FormDraftConflict,
    );
    t.db.update(workspaceFormDrafts).set({ recordId: 'foreign' }).where(eq(workspaceFormDrafts.id, 'raw')).run();
    await expect(saveIdea(document, 1)).rejects.toThrow(FormDraftConflict);
    const foreign = ideaFormCodec.create({ recordId: 'foreign', basis: document.basis, fields: document.fields });
    t.db
      .update(workspaceFormDrafts)
      .set({ recordId: id, body: ideaFormCodec.encode(foreign) })
      .where(eq(workspaceFormDrafts.id, 'raw'))
      .run();
    await expect(saveIdea(document, 1)).rejects.toThrow(FormDraftConflict);
  });
  it('keeps recovered original basis instead of silently accepting a changed record', async () => {
    const id = await createIdea({ title: 'Older', tags: ['retained'] });
    const document = await ideaDocument(id);
    document.fields.body = 'My exact writing';
    await saveIdea(document);
    t.db.update(ideas).set({ title: 'Newer' }).where(eq(ideas.id, id)).run();
    const recovered = await ideaDocument(id);
    expect(recovered.basis).toBe(document.basis);
    expect(recovered.fields.body).toBe('My exact writing');
    await expect(publishIdea(id)).rejects.toThrow(FormDraftConflict);
    expect(t.db.select().from(ideas).get()!.title).toBe('Newer');
    expect(draft().deletedAt).toBeNull();
  });
  it('checks every field even when timestamps match, then explicitly rebases raw input only', async () => {
    const id = await createIdea({ title: 'Older', body: 'Published words' });
    const document = await ideaDocument(id);
    document.fields.body = ' My version ';
    await saveIdea(document);
    const older = t.db.select().from(ideas).get()!;
    t.db.update(ideas).set({ status: 'doing' }).where(eq(ideas.id, id)).run();
    expect(t.db.select().from(ideas).get()!.updatedAt).toEqual(older.updatedAt);
    await expect(publishIdea(id)).rejects.toThrow(FormDraftConflict);
    const shown = await inspectWorkspaceForm(ideaFormPort, 'raw', id, generation);
    const next = await replaceWorkspaceDraft(ideaFormPort, 'raw', document, shown, now, generation);
    expect(t.db.select().from(ideas).get()!.body).toBe('Published words');
    expect(next.document.basis).toBe(formBasis(t.db.select().from(ideas).get()));
    expect(ideaFormCodec.decode(draft().body).fields.body).toBe(' My version ');
    await publishIdea(id, next.revision);
    expect(t.db.select().from(ideas).get()!.body).toBe('My version');
  });
  it('refuses late adoption if either complete shown row has changed', async () => {
    const id = await createIdea({ title: 'Published' });
    const document = await ideaDocument(id);
    await saveIdea(document);
    const shown = await inspectWorkspaceForm(ideaFormPort, 'raw', id, generation);
    t.db.update(ideas).set({ body: 'After comparison' }).where(eq(ideas.id, id)).run();
    await expect(replaceWorkspaceDraft(ideaFormPort, 'raw', document, shown, now, generation)).rejects.toThrow(
      FormDraftConflict,
    );
    const fresh = await inspectWorkspaceForm(ideaFormPort, 'raw', id, generation);
    const revision = await saveIdea({ ...document, fields: { ...document.fields, body: 'New raw' } }, 1);
    await expect(replaceWorkspaceDraft(ideaFormPort, 'raw', document, fresh, now, generation)).rejects.toThrow(
      FormDraftConflict,
    );
    expect(draft().revision).toBe(revision);
  });
  it('publishes and retires atomically, keeps tags, rebuilds merged search and replays one receipt', async () => {
    const id = await createIdea({ title: 'Published', tags: ['unchanged-tag'], area: 'ward' });
    const document = await ideaDocument(id);
    document.fields.title = 'Edited title';
    document.fields.body = ' body marker ';
    await saveIdea(document);
    expect(await publishIdea(id)).toBe(id);
    expect(await publishIdea(id)).toBe(id);
    const current = t.db.select().from(ideas).get()!;
    expect(current).toMatchObject({ title: 'Edited title', body: 'body marker', tags: ['unchanged-tag'] });
    expect(current.searchText).toContain('unchanged-tag');
    expect(current.searchText).toContain('body marker');
    expect(draft()).toMatchObject({ committedId: id, revision: 2 });
    expect(draft().deletedAt).toBeInstanceOf(Date);
    expect(t.db.select().from(auditLog).all()).toHaveLength(1);
    await expect(saveIdea(document, 1)).rejects.toThrow(FormDraftConflict);
    t.db.update(ideas).set(softDelete()).where(eq(ideas.id, id)).run();
    await expect(publishIdea(id)).rejects.toThrow(FormDraftConflict);
  });
  it('rolls back publication and draft retirement if the id-only audit cannot be written', async () => {
    const document = await ideaDocument();
    document.fields.title = 'Synthetic rollback';
    await saveIdea(document);
    const original = draft();
    t.sqlite.exec(
      "CREATE TRIGGER refuse_workspace_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END",
    );
    await expect(publishIdea(null)).rejects.toThrow();
    expect(t.db.select().from(ideas).all()).toEqual([]);
    expect(draft()).toEqual(original);
  });
  it('preserves raw input on a deleted target while refusing publication and adoption', async () => {
    const id = await createIdea({ title: 'Synthetic removed' });
    const document = await ideaDocument(id);
    t.db.update(ideas).set(softDelete()).where(eq(ideas.id, id)).run();
    await saveIdea(document);
    expect((await ideaDocument(id)).basis).toBe(document.basis);
    await expect(publishIdea(id)).rejects.toThrow(FormDraftConflict);
    const shown = await inspectWorkspaceForm(ideaFormPort, 'raw', id, generation);
    await expect(replaceWorkspaceDraft(ideaFormPort, 'raw', document, shown, now, generation)).rejects.toThrow(
      FormDraftConflict,
    );
  });
  it('soft-discards with a CAS receipt and no content in its audit', async () => {
    const document = await ideaDocument();
    document.fields.body = 'Synthetic private marker';
    await saveIdea(document);
    await expect(discardWorkspaceDraft('idea', 'raw', null, 0, now, generation)).rejects.toThrow(FormDraftConflict);
    await discardWorkspaceDraft('idea', 'raw', null, 1, now, generation);
    expect(draft().body).toBe(ideaFormCodec.encode(document));
    expect(draft().deletedAt).toBeInstanceOf(Date);
    expect(t.db.select().from(auditLog).get()).toMatchObject({
      action: 'workspace.draftDiscarded',
      entityId: 'raw',
      summary: null,
      detail: null,
    });
    await expect(publishIdea(null, 2)).rejects.toThrow(FormDraftConflict);
  });
  it('keeps unsupported raw documents and refuses to overwrite them', async () => {
    const document = await ideaDocument();
    await saveIdea(document);
    const unsupported = JSON.stringify({ ...document, version: 2, unknown: 'Retain exact future data' });
    t.db.update(workspaceFormDrafts).set({ body: unsupported }).where(eq(workspaceFormDrafts.id, 'raw')).run();
    await expect(ideaDocument()).rejects.toThrow(UnsupportedFormDraft);
    await expect(saveIdea(document, 1)).rejects.toThrow(UnsupportedFormDraft);
    const shown = await inspectWorkspaceForm(ideaFormPort, 'raw', null, generation);
    await expect(replaceWorkspaceDraft(ideaFormPort, 'raw', document, shown, now, generation)).rejects.toThrow(
      UnsupportedFormDraft,
    );
    expect(draft().body).toBe(unsupported);
  });
  it('fences all old write, publish, inspect, adoption and discard callbacks after replacement', async () => {
    const document = await ideaDocument();
    await saveIdea(document);
    const shown = await inspectWorkspaceForm(ideaFormPort, 'raw', null, generation);
    const replacement = reserveDatasetReplacement();
    replacement.committed();
    replacement.release();
    await expect(saveIdea(document, 1)).rejects.toThrow(DatasetChangedError);
    await expect(publishIdea(null)).rejects.toThrow(DatasetChangedError);
    await expect(inspectWorkspaceForm(ideaFormPort, 'raw', null, generation)).rejects.toThrow(DatasetChangedError);
    await expect(replaceWorkspaceDraft(ideaFormPort, 'raw', document, shown, now, generation)).rejects.toThrow(
      DatasetChangedError,
    );
    await expect(discardWorkspaceDraft('idea', 'raw', null, 1, now, generation)).rejects.toThrow(DatasetChangedError);
    expect(draft().revision).toBe(1);
  });
});

describe('topic-owned raw data and synchronous publication', () => {
  it('refuses unsupported timestamp values instead of allowing them to crash the date widget', async () => {
    const document = await topicDocument();
    expect(() =>
      topicFormCodec.decode(JSON.stringify({ ...document, fields: { ...document.fields, dateValue: 1e99 } })),
    ).toThrow(UnsupportedFormDraft);
    expect(() =>
      topicFormCodec.decode(
        JSON.stringify({ ...document, fields: { ...document.fields, dateValue: new Date('9999-01-01').getTime() } }),
      ),
    ).toThrow(UnsupportedFormDraft);
  });
  it('retains incomplete date, empty title and untouched separators but cannot publish them', async () => {
    const document = await topicDocument();
    document.fields.body = ' exact unfinished body ';
    document.fields.tags = 'alpha،  , beta،';
    document.fields.date = { dateText: '1404/10/', clockText: '2:', customOpen: true };
    await saveWorkspaceDraft(topicFormPort, 'topic-raw', document, 0, generation);
    expect(topicFormCodec.decode(draft('topic-raw').body)).toEqual(document);
    await expect(publishWorkspaceDraft(topicFormPort, 'topic-raw', null, 1, now, generation)).rejects.toThrow();
    const filled = { ...document, fields: { ...document.fields, title: 'Synthetic topic' } };
    await saveWorkspaceDraft(topicFormPort, 'topic-raw', filled, 1, generation);
    await expect(publishWorkspaceDraft(topicFormPort, 'topic-raw', null, 2, now, generation)).rejects.toThrow('تاریخ');
    expect(t.db.select().from(topics).all()).toEqual([]);
    expect(draft('topic-raw').deletedAt).toBeNull();
  });
  it('preserves seconds and milliseconds when the represented date is unchanged', async () => {
    const id = await createTopic({ title: 'Synthetic dated topic', taughtAt: now });
    const document = await topicDocument(id);
    expect(topicFormDate(document.fields, now).getTime()).toBe(now.getTime());
    document.fields.date.dateText = document.fields.date.dateText.replace(/[۰-۹]/g, (c) =>
      String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)),
    );
    expect(topicFormDate(document.fields, now).getTime()).toBe(now.getTime());
    await saveWorkspaceDraft(topicFormPort, 'topic-raw', document, 0, generation);
    await publishWorkspaceDraft(topicFormPort, 'topic-raw', id, 1, now, generation);
    expect(t.db.select().from(topics).get()!.taughtAt!.getTime()).toBe(now.getTime());
  });
  it('refuses an unavailable teacher and keeps the draft, then indexes the live name in the same transaction', async () => {
    const teacher = await createDoctor({ firstName: 'Synthetic', lastName: 'Teacher' });
    const document = await topicDocument();
    document.fields.title = 'Synthetic teaching';
    document.fields.taughtById = teacher;
    await saveWorkspaceDraft(topicFormPort, 'topic-raw', document, 0, generation);
    t.db.update(doctors).set(softDelete()).where(eq(doctors.id, teacher)).run();
    await expect(publishWorkspaceDraft(topicFormPort, 'topic-raw', null, 1, now, generation)).rejects.toThrow('استاد');
    expect(t.db.select().from(topics).all()).toEqual([]);
    t.db.update(doctors).set({ deletedAt: null, lastName: 'Changed name' }).where(eq(doctors.id, teacher)).run();
    await publishWorkspaceDraft(topicFormPort, 'topic-raw', null, 1, now, generation);
    expect(await topicsQuery({ search: 'Changed name' })).toHaveLength(1);
  });
  it('retains unchanged content when an API patch contains undefined fields', async () => {
    const id = await createTopic({ title: 'Synthetic topic', body: 'Source marker', tags: ['retained'] });
    await updateTopic(id, { title: undefined, body: undefined, tags: undefined, summary: 'Added summary' });
    expect((await topicsQuery({ search: 'Source marker' }))[0]?.topic).toMatchObject({
      title: 'Synthetic topic',
      tags: ['retained'],
      summary: 'Added summary',
    });
  });
});
