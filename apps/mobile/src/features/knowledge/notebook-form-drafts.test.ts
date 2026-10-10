import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { tablesOf } from '@/db/query-tables';
import { auditLog, prescriptionTemplates, specialties, specialtyProfiles, workspaceFormDrafts } from '@/db/schema';
import {
  inspectWorkspaceForm,
  publishWorkspaceDraft,
  replaceWorkspaceDraft,
  saveWorkspaceDraft,
  workspaceFormSeed,
} from '@/features/workspace-forms/queries';
import { datasetGeneration, DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';
import { formBasis, FormDraftConflict, UnsupportedFormDraft } from '@/lib/form-document';
import { softDelete, stamps } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { prescriptionFormCodec, prescriptionFormLine, specialtyProfileFormCodec } from './form-draft';
import {
  prescriptionFormPort,
  prescriptionFormQuery,
  specialtyFormReferenceQuery,
  specialtyProfileFormPort,
  specialtyProfileFormQuery,
} from './form-draft-queries';
import { createPrescription, prescriptionsQuery, updatePrescription } from './prescriptions-queries';
import { createSpecialtyProfile, specialtyProfilesQuery, updateSpecialtyProfile } from './specialty-profiles-queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
let t: TestDatabase;
let generation: number;
const now = new Date('2026-01-02T10:00:00.123Z');
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  generation = datasetGeneration();
});
const draft = (id = 'raw') => t.db.select().from(workspaceFormDrafts).where(eq(workspaceFormDrafts.id, id)).get()!;
async function profileDocument(recordId: string | null = null) {
  return workspaceFormSeed(specialtyProfileFormPort, (await specialtyProfileFormQuery(recordId))[0]!, recordId, now)
    .document;
}
async function prescriptionDocument(recordId: string | null = null) {
  return workspaceFormSeed(prescriptionFormPort, (await prescriptionFormQuery(recordId))[0]!, recordId, now).document;
}
const publishProfile = (recordId: string | null = null, revision = 1) =>
  publishWorkspaceDraft(specialtyProfileFormPort, 'raw', recordId, revision, now, generation);
const publishPrescription = (recordId: string | null = null, revision = 1) =>
  publishWorkspaceDraft(prescriptionFormPort, 'raw', recordId, revision, now, generation);

describe('specialty and prescription raw recovery with migrated SQLite', () => {
  it('keeps an imported out-of-range fit editable as raw input until explicit correction', async () => {
    const id = await createSpecialtyProfile({ nameText: 'Synthetic legacy fit', personalFit: 6 });
    const document = await profileDocument(id);
    expect(document.fields.personalFit).toBe(6);
    document.fields.overview = 'Exact retained words';
    await saveWorkspaceDraft(specialtyProfileFormPort, 'raw', document, 0, generation);
    await expect(publishProfile(id)).rejects.toThrow();
    expect(specialtyProfileFormCodec.decode(draft().body).fields.personalFit).toBe(6);
    document.fields.personalFit = 4;
    await saveWorkspaceDraft(specialtyProfileFormPort, 'raw', document, 1, generation);
    await publishProfile(id, 2);
    expect(t.db.select().from(specialtyProfiles).where(eq(specialtyProfiles.id, id)).get()).toMatchObject({
      personalFit: 4,
      overview: 'Exact retained words',
    });
  });
  it('reads one explicit new seed and watches the published and raw tables', async () => {
    expect(await specialtyProfileFormQuery(null)).toEqual([{ scope: '[null,null]', record: null, draft: null }]);
    expect(await prescriptionFormQuery(null)).toEqual([{ scope: '[null,null]', record: null, draft: null }]);
    expect(tablesOf(specialtyProfileFormQuery(null)).sort()).toEqual(['specialty_profiles', 'workspace_form_drafts']);
    expect(tablesOf(prescriptionFormQuery(null)).sort()).toEqual(['prescription_templates', 'workspace_form_drafts']);
  });
  it('acknowledges exact incomplete profiles without publishing or trimming any field', async () => {
    const document = await profileDocument();
    document.fields.overview = '  Raw\n\nresearch  ';
    document.fields.sourcesText = '  Quoted words  ';
    document.fields.tags = ' first،، second, ';
    await saveWorkspaceDraft(specialtyProfileFormPort, 'raw', document, 0, generation);
    expect(specialtyProfileFormCodec.decode(draft().body)).toEqual(document);
    expect(t.db.select().from(specialtyProfiles).all()).toEqual([]);
    await expect(publishProfile()).rejects.toThrow('رشته را انتخاب کنید');
    expect(draft().deletedAt).toBeNull();
  });
  it('preserves every partial prescription line, empty drug, stable key and exact whitespace', async () => {
    const document = await prescriptionDocument();
    document.fields.items = [
      { ...prescriptionFormLine(undefined, 'line-a'), dose: ' 12,5 mg ', sig: '  Raw SIG\n ', quantity: '1,' },
      { ...prescriptionFormLine(undefined, 'line-b'), drug: '  Synthetic drug  ', notes: '  incomplete  ' },
    ];
    document.fields.tags = 'raw،،separators, ';
    await saveWorkspaceDraft(prescriptionFormPort, 'raw', document, 0, generation);
    expect(prescriptionFormCodec.decode(draft().body)).toEqual(document);
    expect(t.db.select().from(prescriptionTemplates).all()).toEqual([]);
    const recovered = workspaceFormSeed(prescriptionFormPort, (await prescriptionFormQuery(null))[0]!, null, now);
    expect(recovered.document.fields.items).toEqual(document.fields.items);
    document.fields.title = 'Synthetic partial prescription';
    await saveWorkspaceDraft(prescriptionFormPort, 'raw', document, 1, generation);
    const before = draft();
    await expect(publishPrescription(null, 2)).rejects.toThrow('قلم ناقص');
    expect(draft()).toEqual(before);
    expect(t.db.select().from(prescriptionTemplates).all()).toEqual([]);
  });
  it('publishes a complete prescription once, strips only raw line keys and replays its receipt', async () => {
    const document = await prescriptionDocument();
    document.fields.title = '  Synthetic prescription  ';
    document.fields.items = [
      { ...prescriptionFormLine(undefined, 'line-a'), drug: ' Synthetic drug ', dose: ' 500 mg ', sig: ' exact sig ' },
      prescriptionFormLine(undefined, 'blank'),
    ];
    await saveWorkspaceDraft(prescriptionFormPort, 'raw', document, 0, generation);
    const id = await publishPrescription();
    expect(await publishPrescription()).toBe(id);
    expect(t.db.select().from(prescriptionTemplates).all()).toHaveLength(1);
    const row = t.db.select().from(prescriptionTemplates).get()!;
    expect(row.title).toBe('Synthetic prescription');
    expect(row.items).toEqual([
      expect.objectContaining({ drug: 'Synthetic drug', dose: ' 500 mg ', sig: ' exact sig ' }),
    ]);
    expect(row.items![0]).not.toHaveProperty('key');
    expect(draft()).toMatchObject({ committedId: id, revision: 2, deletedAt: now });
    await expect(saveWorkspaceDraft(prescriptionFormPort, 'raw', document, 1, generation)).rejects.toThrow(
      FormDraftConflict,
    );
  });
  it('keeps legacy null items in the complete original basis and notices null changing to an empty array', async () => {
    const id = await createPrescription({ title: 'Legacy template', items: [{ drug: 'Synthetic' }] });
    t.db
      .update(prescriptionTemplates)
      .set({ items: null, usageCount: 7, lastUsedAt: now })
      .where(eq(prescriptionTemplates.id, id))
      .run();
    const original = t.db.select().from(prescriptionTemplates).get()!;
    const document = await prescriptionDocument(id);
    expect(document.basis).toBe(formBasis(original));
    expect(JSON.parse(document.basis!).items).toBeNull();
    document.fields.items[0]!.drug = 'Synthetic replacement';
    await saveWorkspaceDraft(prescriptionFormPort, 'raw', document, 0, generation);
    t.db.update(prescriptionTemplates).set({ items: [] }).where(eq(prescriptionTemplates.id, id)).run();
    await expect(publishPrescription(id)).rejects.toThrow(FormDraftConflict);
    expect(t.db.select().from(prescriptionTemplates).get()!.items).toEqual([]);
    expect(draft().deletedAt).toBeNull();
  });
  it.each(['usage', 'legacy-item'])(
    'compares %s fields even when the published timestamp did not change',
    async (changed) => {
      const id = await createPrescription({
        title: 'Original prescription',
        items: [{ drug: 'Synthetic', dose: '10 mg' }],
      });
      const document = await prescriptionDocument(id);
      document.fields.adviceText = 'Local advice';
      await saveWorkspaceDraft(prescriptionFormPort, 'raw', document, 0, generation);
      if (changed === 'usage')
        t.db
          .update(prescriptionTemplates)
          .set({ usageCount: 2, lastUsedAt: now })
          .where(eq(prescriptionTemplates.id, id))
          .run();
      else
        t.sqlite.run('UPDATE prescription_templates SET items = ? WHERE id = ?', [
          JSON.stringify([{ drug: 'Synthetic', dose: '10 mg', legacySource: 'Changed legacy provenance' }]),
          id,
        ]);
      const before = t.db.select().from(prescriptionTemplates).get()!;
      await expect(publishPrescription(id)).rejects.toThrow(FormDraftConflict);
      expect(t.db.select().from(prescriptionTemplates).get()).toEqual(before);
      expect(draft().deletedAt).toBeNull();
    },
  );
  it('requires exact explicit conflict adoption and a separate publication', async () => {
    const id = await createPrescription({ title: 'Original', items: [{ drug: 'Synthetic' }] });
    const document = await prescriptionDocument(id);
    document.fields.adviceText = 'Local words';
    await saveWorkspaceDraft(prescriptionFormPort, 'raw', document, 0, generation);
    await updatePrescription(id, { adviceText: 'Changed published words' });
    await expect(publishPrescription(id)).rejects.toThrow(FormDraftConflict);
    const shown = await inspectWorkspaceForm(prescriptionFormPort, 'raw', id, generation);
    t.db.update(prescriptionTemplates).set({ usageCount: 1 }).where(eq(prescriptionTemplates.id, id)).run();
    await expect(replaceWorkspaceDraft(prescriptionFormPort, 'raw', document, shown, now, generation)).rejects.toThrow(
      FormDraftConflict,
    );
    const nextShown = await inspectWorkspaceForm(prescriptionFormPort, 'raw', id, generation);
    const adopted = await replaceWorkspaceDraft(prescriptionFormPort, 'raw', document, nextShown, now, generation);
    expect(t.db.select().from(prescriptionTemplates).get()!.adviceText).toBe('Changed published words');
    await publishPrescription(id, adopted.revision);
    expect(t.db.select().from(prescriptionTemplates).get()!).toMatchObject({
      adviceText: 'Local words',
      usageCount: 1,
    });
  });
  it.each(['profile', 'prescription'])(
    'rolls back %s publication, retirement, receipt and audit together',
    async (kind) => {
      if (kind === 'profile') {
        const document = await profileDocument();
        document.fields.nameText = 'Synthetic research';
        await saveWorkspaceDraft(specialtyProfileFormPort, 'raw', document, 0, generation);
      } else {
        const document = await prescriptionDocument();
        document.fields.title = 'Synthetic prescription';
        document.fields.items[0]!.drug = 'Synthetic';
        await saveWorkspaceDraft(prescriptionFormPort, 'raw', document, 0, generation);
      }
      t.sqlite.exec(
        "CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
      );
      const before = draft();
      await expect(kind === 'profile' ? publishProfile() : publishPrescription()).rejects.toThrow();
      expect(draft()).toEqual(before);
      expect(t.db.select().from(specialtyProfiles).all()).toEqual([]);
      expect(t.db.select().from(prescriptionTemplates).all()).toEqual([]);
      expect(t.db.select().from(auditLog).all()).toEqual([]);
    },
  );
  it('retains original archived specialties and their merged profile search words', async () => {
    t.db
      .insert(specialties)
      .values({
        id: 'history',
        ...stamps(),
        nameFa: 'Historical specialty',
        nameEn: 'Historical',
        aliases: ['Old alias'],
      })
      .run();
    const profile = await createSpecialtyProfile({ specialtyId: 'history', overview: 'Old body' });
    const prescription = await createPrescription({
      title: 'Historical template',
      specialtyId: 'history',
      items: [{ drug: 'Synthetic' }],
    });
    t.db.update(specialties).set(softDelete()).where(eq(specialties.id, 'history')).run();
    await updateSpecialtyProfile(profile, { overview: 'New body' });
    await updatePrescription(prescription, { adviceText: 'New advice' });
    expect((await specialtyProfilesQuery({ search: 'Old alias New body' }))[0]?.profile.id).toBe(profile);
    expect((await prescriptionsQuery())[0]?.template.specialtyId).toBe('history');
    expect((await specialtyFormReferenceQuery('history'))[0]?.specialty?.deletedAt).toBeInstanceOf(Date);
  });
  it.each(['archived', 'missing', ''])(
    'rejects a newly selected unavailable specialty %s in both transactions',
    async (id) => {
      t.db
        .insert(specialties)
        .values({ id: 'archived', ...stamps(), nameFa: 'Synthetic archived', ...softDelete() })
        .run();
      const profile = await profileDocument();
      profile.fields.specialtyId = id;
      const prescription = await prescriptionDocument();
      prescription.fields.specialtyId = id;
      prescription.fields.title = 'Synthetic';
      prescription.fields.items[0]!.drug = 'Synthetic';
      await saveWorkspaceDraft(specialtyProfileFormPort, 'profile', profile, 0, generation);
      await saveWorkspaceDraft(prescriptionFormPort, 'raw', prescription, 0, generation);
      await expect(
        publishWorkspaceDraft(specialtyProfileFormPort, 'profile', null, 1, now, generation),
      ).rejects.toThrow('تخصص');
      await expect(publishPrescription()).rejects.toThrow('تخصص');
      expect(t.db.select().from(specialtyProfiles).all()).toEqual([]);
      expect(t.db.select().from(prescriptionTemplates).all()).toEqual([]);
      expect(draft('profile').deletedAt).toBeNull();
      expect(draft().deletedAt).toBeNull();
    },
  );
  it('preserves unsupported fields and rejects duplicate raw line keys without rewriting their stored body', async () => {
    const document = await prescriptionDocument();
    await saveWorkspaceDraft(prescriptionFormPort, 'raw', document, 0, generation);
    const unsupported = JSON.stringify({
      ...document,
      fields: { ...document.fields, futureField: 'Keep exact raw body' },
    });
    t.db.update(workspaceFormDrafts).set({ body: unsupported }).where(eq(workspaceFormDrafts.id, 'raw')).run();
    expect(() => prescriptionFormCodec.decode(unsupported)).toThrow(UnsupportedFormDraft);
    await expect(saveWorkspaceDraft(prescriptionFormPort, 'raw', document, 1, generation)).rejects.toThrow(
      UnsupportedFormDraft,
    );
    expect(draft().body).toBe(unsupported);
    expect(() =>
      prescriptionFormCodec.encode({
        ...document,
        fields: { ...document.fields, items: [document.fields.items[0]!, document.fields.items[0]!] },
      }),
    ).toThrow(UnsupportedFormDraft);
    const profile = await profileDocument();
    expect(() => specialtyProfileFormCodec.decode(JSON.stringify({ ...profile, version: 2 }))).toThrow(
      UnsupportedFormDraft,
    );
  });
  it('keeps an original edit draft when its target is deleted and fences both old raw and publication after replacement', async () => {
    const id = await createPrescription({ title: 'Original', items: [{ drug: 'Synthetic' }] });
    const document = await prescriptionDocument(id);
    document.fields.adviceText = 'Raw retained words';
    await saveWorkspaceDraft(prescriptionFormPort, 'raw', document, 0, generation);
    t.db.update(prescriptionTemplates).set(softDelete()).where(eq(prescriptionTemplates.id, id)).run();
    const recovered = workspaceFormSeed(prescriptionFormPort, (await prescriptionFormQuery(id))[0]!, id, now);
    expect(recovered.document.fields.adviceText).toBe('Raw retained words');
    await expect(publishPrescription(id)).rejects.toThrow(FormDraftConflict);
    const before = draft();
    const replacement = reserveDatasetReplacement();
    replacement.committed();
    replacement.release();
    await expect(saveWorkspaceDraft(prescriptionFormPort, 'raw', document, 1, generation)).rejects.toThrow(
      DatasetChangedError,
    );
    await expect(publishPrescription(id)).rejects.toThrow(DatasetChangedError);
    expect(draft()).toEqual(before);
  });
});
