import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { tablesOf } from '@/db/query-tables';
import { auditLog, extensions, places, workspaceFormDrafts } from '@/db/schema';
import {
  inspectWorkspaceForm,
  publishWorkspaceDraft,
  replaceWorkspaceDraft,
  saveWorkspaceDraft,
  workspaceDraftsQuery,
  workspaceFormSeed,
} from '@/features/workspace-forms/queries';
import { datasetGeneration, reserveDatasetReplacement } from '@/lib/dataset-write';
import { FormDraftConflict, UnsupportedFormDraft } from '@/lib/form-document';
import { softDelete } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { extensionFormCodec, placeFormCodec } from './form-draft';
import { extensionFormPort, extensionFormQuery, placeFormPort, placeFormQuery } from './form-draft-queries';
import { createExtension, createPlace, extensionsQuery, placesQuery, updatePlace } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
let t: TestDatabase;
let generation: number;
const now = new Date('2026-01-02T10:00:00.123Z');
const extensionPort = extensionFormPort();
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  generation = datasetGeneration();
});
const rows = () => ({
  places: t.db.select().from(places).all(),
  extensions: t.db.select().from(extensions).all(),
  drafts: t.db.select().from(workspaceFormDrafts).all(),
  audits: t.db.select().from(auditLog).all(),
});
async function placeDocument(id: string | null = null) {
  return workspaceFormSeed(placeFormPort, (await placeFormQuery(id))[0]!, id, now).document;
}
async function extensionDocument(id: string | null = null) {
  return workspaceFormSeed(extensionPort, (await extensionFormQuery(id))[0]!, id, now).document;
}
const createParent = (name = 'Synthetic hospital') => createPlace({ name, kind: 'hospital' });

describe('place and extension raw recovery on migrated SQLite', () => {
  it('reads one explicit empty seed and observes both target and draft tables', async () => {
    expect(await placeFormQuery(null)).toEqual([{ scope: '[null,null]', record: null, draft: null }]);
    expect(await extensionFormQuery(null)).toEqual([{ scope: '[null,null]', record: null, draft: null }]);
    expect(tablesOf(placeFormQuery(null)).sort()).toEqual(['places', 'workspace_form_drafts']);
    expect(tablesOf(extensionFormQuery(null)).sort()).toEqual(['extensions', 'workspace_form_drafts']);
  });

  it('keeps every partial place field exactly and derives no coordinates while saving raw input', async () => {
    const document = await placeDocument();
    Object.assign(document.fields, {
      name: '  ',
      city: ' synthetic city ',
      address: ' raw\naddress ',
      phone: ' ۱۲+ ( ',
      switchboard: ' ۳۴- ',
      mapUrl: ' geo:35.7000,51.4000 ',
      lat: ' ۳۵. ',
      lng: ' - ',
      notes: ' \nraw notes  ',
    });
    await saveWorkspaceDraft(placeFormPort, 'raw-place', document, 0, generation);
    const stored = t.db.select().from(workspaceFormDrafts).get()!;
    expect(placeFormCodec.decode(stored.body)).toEqual(document);
    expect(rows().places).toEqual([]);
    await expect(publishWorkspaceDraft(placeFormPort, 'raw-place', null, 1, now, generation)).rejects.toThrow('نام');
    expect(rows().drafts).toEqual([stored]);
    expect(rows().audits).toEqual([]);
  });

  it('preserves raw extension references and incomplete contact input without creating records', async () => {
    const document = await extensionDocument();
    Object.assign(document.fields, {
      placeId: '',
      department: ' ',
      extension: ' ۲۳* ',
      directLine: ' ۴۵+ ( ',
      floor: ' ۲ ',
      contactPerson: ' synthetic contact ',
      notes: '\n raw  ',
    });
    await saveWorkspaceDraft(extensionPort, 'raw-extension', document, 0, generation);
    expect(extensionFormCodec.decode(t.db.select().from(workspaceFormDrafts).get()!.body)).toEqual(document);
    expect(rows().extensions).toEqual([]);
    expect(rows().places).toEqual([]);
  });

  it('rejects unknown fields, foreign kinds and unsupported versions without rewriting the raw document', async () => {
    const document = await placeDocument();
    for (const changed of [
      { ...document, fields: { ...document.fields, extra: 'retained original body' } },
      { ...document, kind: 'extension' },
      { ...document, version: 2 },
    ])
      expect(() => placeFormCodec.decode(JSON.stringify(changed))).toThrow(UnsupportedFormDraft);
    expect(rows().drafts).toEqual([]);
  });

  it('normalizes only publication, keeps a replay receipt and creates one place', async () => {
    const document = await placeDocument();
    Object.assign(document.fields, {
      name: ' Synthetic place ',
      phone: ' ۱۲+ ( ',
      mapUrl: ' geo:35.7000,51.4000 ',
      notes: ' retained ',
    });
    await saveWorkspaceDraft(placeFormPort, 'raw-place', document, 0, generation);
    const id = await publishWorkspaceDraft(placeFormPort, 'raw-place', null, 1, now, generation);
    expect(await publishWorkspaceDraft(placeFormPort, 'raw-place', null, 1, now, generation)).toBe(id);
    expect(rows().places).toHaveLength(1);
    expect(rows().places[0]).toMatchObject({
      name: 'Synthetic place',
      phone: '12+ (',
      lat: '35.7000',
      lng: '51.4000',
      notes: 'retained',
    });
    expect(placeFormCodec.decode(rows().drafts[0]!.body)).toEqual(document);
    expect(rows().drafts[0]).toMatchObject({ committedId: id, deletedAt: now, revision: 2 });
    expect(rows().audits).toHaveLength(1);
    await expect(saveWorkspaceDraft(placeFormPort, 'raw-place', document, 1, generation)).rejects.toThrow(
      FormDraftConflict,
    );
  });

  it.each(['missing', 'deleted'] as const)(
    'refuses a %s newly selected extension parent and retains its raw draft',
    async (status) => {
      const placeId = status === 'missing' ? 'synthetic-missing' : await createParent();
      if (status === 'deleted') t.db.update(places).set(softDelete(now)).where(eq(places.id, placeId)).run();
      const document = await extensionDocument();
      Object.assign(document.fields, { placeId, department: 'Synthetic department', extension: ' ۲۳۴۵ ' });
      await saveWorkspaceDraft(extensionPort, 'raw-extension', document, 0, generation);
      const before = rows();
      await expect(publishWorkspaceDraft(extensionPort, 'raw-extension', null, 1, now, generation)).rejects.toThrow(
        'مکان',
      );
      expect(rows()).toEqual(before);
    },
  );

  it('does not turn an ordinary recovered edit into a move from an archived original parent', async () => {
    const original = await createParent();
    const destination = await createParent('Synthetic destination');
    const id = await createExtension({ placeId: original, department: 'Synthetic department', extension: '2345' });
    const document = await extensionDocument(id);
    document.fields.placeId = destination;
    await saveWorkspaceDraft(extensionPort, 'raw-extension', document, 0, generation);
    t.db.update(places).set(softDelete(now)).where(eq(places.id, original)).run();
    const before = rows();
    await expect(publishWorkspaceDraft(extensionPort, 'raw-extension', id, 1, now, generation)).rejects.toThrow('مکان');
    expect(rows()).toEqual(before);
  });

  it('rebuilds an edited extension from its merged row and destination while retaining hidden fields', async () => {
    const original = await createParent();
    const destination = await createParent('Synthetic destination');
    const id = await createExtension({
      placeId: original,
      department: 'Synthetic department',
      extension: '2345',
      availableHours: '08-16',
    });
    t.db.update(extensions).set({ usageCount: 9, starred: true }).where(eq(extensions.id, id)).run();
    const document = await extensionDocument(id);
    Object.assign(document.fields, { placeId: destination, extension: ' ۵۶۷۸ ', notes: ' retained words ' });
    await saveWorkspaceDraft(extensionPort, 'raw-extension', document, 0, generation);
    await publishWorkspaceDraft(extensionPort, 'raw-extension', id, 1, now, generation);
    expect((await extensionsQuery({ search: 'destination department 5678 retained' }))[0]?.extension).toMatchObject({
      id,
      placeId: destination,
      availableHours: '08-16',
      usageCount: 9,
      starred: true,
    });
    expect(await extensionsQuery({ search: 'hospital 2345' })).toEqual([]);
  });

  it('keeps place-only hidden metadata when publishing a recovered edit', async () => {
    const id = await createPlace({
      name: 'Synthetic original',
      kind: 'hospital',
      website: 'https://example.invalid',
      tags: ['synthetic-tag'],
      starred: true,
    });
    const document = await placeDocument(id);
    document.fields.name = 'Synthetic updated';
    await saveWorkspaceDraft(placeFormPort, 'raw-place', document, 0, generation);
    await publishWorkspaceDraft(placeFormPort, 'raw-place', id, 1, now, generation);
    expect(rows().places[0]).toMatchObject({
      id,
      website: 'https://example.invalid',
      tags: ['synthetic-tag'],
      starred: true,
    });
    expect((await placesQuery({ search: 'updated synthetic-tag' })).map((row) => row.id)).toEqual([id]);
  });

  it('rolls back parent rename, child indices, receipt and audit when any child write fails', async () => {
    const id = await createParent();
    await createExtension({ placeId: id, department: 'Synthetic first', extension: '2345' });
    await createExtension({ placeId: id, department: 'Synthetic second', extension: '3456' });
    const document = await placeDocument(id);
    document.fields.name = 'Synthetic renamed';
    await saveWorkspaceDraft(placeFormPort, 'raw-place', document, 0, generation);
    t.sqlite.exec(`CREATE TRIGGER fail_child_index BEFORE UPDATE OF search_text ON extensions
      WHEN OLD.department = 'Synthetic second' BEGIN SELECT RAISE(ABORT, 'Synthetic index failure'); END`);
    const before = rows();
    await expect(publishWorkspaceDraft(placeFormPort, 'raw-place', id, 1, now, generation)).rejects.toThrow(
      'Synthetic index failure',
    );
    expect(rows()).toEqual(before);
  });

  it.each(['place', 'extension'] as const)(
    'rolls back %s publication and raw retirement when audit insertion fails',
    async (kind) => {
      const document = kind === 'place' ? await placeDocument() : await extensionDocument();
      const port = kind === 'place' ? placeFormPort : extensionPort;
      if (document.kind === 'place') Object.assign(document.fields, { name: 'Synthetic new' });
      else
        Object.assign(document.fields, {
          placeId: await createParent(),
          department: 'Synthetic department',
          extension: '2345',
        });
      // The two codecs deliberately remain feature-specific; do not coerce their schemas.
      if (kind === 'place')
        await saveWorkspaceDraft(
          placeFormPort,
          'raw-place',
          document as Awaited<ReturnType<typeof placeDocument>>,
          0,
          generation,
        );
      else
        await saveWorkspaceDraft(
          extensionPort,
          'raw-extension',
          document as Awaited<ReturnType<typeof extensionDocument>>,
          0,
          generation,
        );
      t.sqlite.exec(
        `CREATE TRIGGER fail_form_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'Synthetic audit failure'); END`,
      );
      const before = rows();
      const result =
        kind === 'place'
          ? publishWorkspaceDraft(placeFormPort, 'raw-place', null, 1, now, generation)
          : publishWorkspaceDraft(extensionPort, 'raw-extension', null, 1, now, generation);
      expect(port.codec.kind).toBe(kind);
      await expect(result).rejects.toThrow('Synthetic audit failure');
      expect(rows()).toEqual(before);
    },
  );

  it('requires exact conflict adoption and a separate Save before overwriting an edited place', async () => {
    const id = await createParent();
    const document = await placeDocument(id);
    document.fields.notes = 'Original local draft';
    await saveWorkspaceDraft(placeFormPort, 'raw-place', document, 0, generation);
    await updatePlace(id, { city: 'Concurrent synthetic city' });
    await expect(publishWorkspaceDraft(placeFormPort, 'raw-place', id, 1, now, generation)).rejects.toThrow(
      FormDraftConflict,
    );
    const shown = await inspectWorkspaceForm(placeFormPort, 'raw-place', id, generation);
    const adopted = await replaceWorkspaceDraft(placeFormPort, 'raw-place', document, shown, now, generation);
    expect(rows().places[0]?.notes).toBeNull();
    await publishWorkspaceDraft(placeFormPort, adopted.id, id, adopted.revision, now, generation);
    expect(rows().places[0]?.notes).toBe('Original local draft');
  });

  it('refuses old-dataset publication without acknowledging or changing the retained raw draft', async () => {
    const document = await placeDocument();
    document.fields.name = 'Synthetic old dataset';
    await saveWorkspaceDraft(placeFormPort, 'raw-place', document, 0, generation);
    const replacement = reserveDatasetReplacement();
    try {
      replacement.committed();
    } finally {
      replacement.release();
    }
    const before = rows();
    await expect(publishWorkspaceDraft(placeFormPort, 'raw-place', null, 1, now, generation)).rejects.toThrow();
    expect(rows()).toEqual(before);
  });

  it('projects actual raw place names and departments in the existing unfinished links', async () => {
    const place = await placeDocument();
    place.fields.name = '  Synthetic unfinished place  ';
    const ext = await extensionDocument();
    ext.fields.department = '  Synthetic unfinished department  ';
    await saveWorkspaceDraft(placeFormPort, 'raw-place', place, 0, generation);
    await saveWorkspaceDraft(extensionPort, 'raw-extension', ext, 0, generation);
    expect((await workspaceDraftsQuery('place'))[0]?.title).toBe(place.fields.name);
    expect((await workspaceDraftsQuery('extension'))[0]?.title).toBe(ext.fields.department);
  });
});
