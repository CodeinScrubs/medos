import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { occasionFormDrafts, occasions } from '@/db/schema';
import { datasetGeneration, reserveDatasetReplacement } from '@/lib/dataset-write';
import { fromJalali } from '@/lib/jalali';
import * as notifications from '@/platform/notifications';
import { useTestDatabase } from '@/test/db-client';
import { resetNotifications, scheduled } from '@/test/mocks/notifications';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { initialOccasionForm } from './occasion-form-draft';
import {
  commitOccasionFormDraft,
  discardOccasionFormDraft,
  inspectOccasionForm,
  occasionFormQuery,
  replaceOccasionFormDraft,
  saveOccasionFormDraft,
} from './occasion-form-queries';
import { createOccasion, deleteOccasion, occasionQuery, updateOccasion } from './occasions-queries';
import { createDoctor, deleteDoctor } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase;
let doctorId: string;
const now = fromJalali(1405, 7, 15);
const draft = (id = 'draft') => t.db.select().from(occasionFormDrafts).where(eq(occasionFormDrafts.id, id)).get()!;
function document() {
  return initialOccasionForm(null, '2024-03-20', now);
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  resetNotifications();
  doctorId = await createDoctor({ firstName: 'Example', lastName: 'Colleague', relationship: 'colleague' });
  jest.restoreAllMocks();
});

describe('raw occasion persistence and publication', () => {
  it('recovers exact incomplete input without a date, occasion or native notification', async () => {
    const doc = document();
    doc.fields = {
      ...doc.fields,
      title: 'Unsubmitted birthday',
      dateText: '1405/12/',
      leadText: '365',
      messageTemplate: 'Exact draft {نام}',
    };
    await saveOccasionFormDraft('draft', doctorId, null, doc, 0);
    expect(occasionFormQuery(doctorId, null).get()?.draft?.body).toBe(JSON.stringify(doc));
    const before = draft();
    await expect(commitOccasionFormDraft('draft', doctorId, null, 1, now)).rejects.toThrow();
    expect(draft()).toEqual(before);
    expect(t.db.select().from(occasions).all()).toEqual([]);
    expect(scheduled.size).toBe(0);
  });

  it('refuses stale revisions and duplicate draft sessions without losing the saved text', async () => {
    const doc = document();
    await saveOccasionFormDraft('draft', doctorId, null, doc, 0);
    const before = draft();
    await expect(saveOccasionFormDraft('draft', doctorId, null, doc, 0)).rejects.toThrow();
    await expect(saveOccasionFormDraft('another', doctorId, null, doc, 0)).rejects.toThrow();
    expect(draft()).toEqual(before);
    expect(await saveOccasionFormDraft('draft', doctorId, null, doc, 1)).toBe(1);
  });

  it('atomically publishes exactly once and keeps the original raw source', async () => {
    const doc = document();
    doc.fields.dateText = '1403/12/30';
    doc.fields.title = 'Leap birthday';
    await saveOccasionFormDraft('draft', doctorId, null, doc, 0);
    const { id, reminderPending } = await commitOccasionFormDraft('draft', doctorId, null, 1, now);
    expect(reminderPending).toBe(false);
    const before = occasionQuery(id).get();
    expect(before).toMatchObject({ jalaliMonth: 12, jalaliDay: 30, onDate: null, title: 'Leap birthday' });
    expect(draft()).toMatchObject({ committedOccasionId: id, revision: 2, body: JSON.stringify(doc) });
    expect(draft().deletedAt).not.toBeNull();
    expect(await commitOccasionFormDraft('draft', doctorId, null, 1, now)).toEqual({ id, reminderPending: false });
    expect(occasionQuery(id).get()).toEqual(before);
    expect(t.db.select().from(occasions).all()).toHaveLength(1);
    expect(occasionFormQuery(doctorId, null).get()?.draft).toBeNull();
  });

  it('rolls back publication if retiring the raw draft fails and never touches Android', async () => {
    await saveOccasionFormDraft('draft', doctorId, null, document(), 0);
    const before = draft();
    const schedule = jest.spyOn(notifications, 'scheduleReminder');
    t.sqlite.exec(
      "CREATE TRIGGER fail_retirement BEFORE UPDATE ON occasion_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(commitOccasionFormDraft('draft', doctorId, null, 1, now)).rejects.toThrow();
    expect(draft()).toEqual(before);
    expect(t.db.select().from(occasions).all()).toEqual([]);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('keeps one published occasion repairable after native scheduling fails', async () => {
    await saveOccasionFormDraft('draft', doctorId, null, document(), 0);
    jest.spyOn(notifications, 'scheduleReminder').mockRejectedValueOnce(new Error('native unavailable'));
    const { id, reminderPending } = await commitOccasionFormDraft('draft', doctorId, null, 1, now);
    expect(reminderPending).toBe(true);
    expect(draft().committedOccasionId).toBe(id);
    expect(occasionQuery(id).get()?.reminderAppliedRevision).toBe(-1);
    expect(await commitOccasionFormDraft('draft', doctorId, null, 1, now)).toEqual({ id, reminderPending: false });
    expect(t.db.select().from(occasions).all()).toHaveLength(1);
  });

  it('refuses a changed edit target and only rebases after the owner compares it', async () => {
    const id = await createOccasion({ doctorId, kind: 'birthday', title: 'Original', jalaliMonth: 1, jalaliDay: 1 });
    const doc = initialOccasionForm(occasionQuery(id).get()!, null, now);
    doc.fields.title = 'My correction';
    await saveOccasionFormDraft('draft', doctorId, id, doc, 0);
    await updateOccasion(id, { title: 'External correction' });
    await expect(commitOccasionFormDraft('draft', doctorId, id, 1, now)).rejects.toThrow();
    const comparison = await inspectOccasionForm('draft', doctorId, id);
    const rebased = await replaceOccasionFormDraft('draft', doctorId, id, doc, comparison);
    await commitOccasionFormDraft(rebased.id, doctorId, id, rebased.revision, now);
    expect(occasionQuery(id).get()?.title).toBe('My correction');
  });

  it('refuses a comparison that changed again before confirmation', async () => {
    await saveOccasionFormDraft('draft', doctorId, null, document(), 0);
    const comparison = await inspectOccasionForm('draft', doctorId, null);
    const newer = document();
    newer.fields.title = 'Newer saved version';
    await saveOccasionFormDraft('draft', doctorId, null, newer, 1);
    const before = draft();
    await expect(replaceOccasionFormDraft('draft', doctorId, null, document(), comparison)).rejects.toThrow();
    expect(draft()).toEqual(before);
  });

  it.each(['doctor', 'occasion'] as const)(
    'retains raw recovery but refuses publication after deleting its %s',
    async (kind) => {
      const id = await createOccasion({ doctorId, kind: 'birthday', title: 'Original', jalaliMonth: 1, jalaliDay: 1 });
      const doc = initialOccasionForm(occasionQuery(id).get()!, null, now);
      await saveOccasionFormDraft('draft', doctorId, id, doc, 0);
      if (kind === 'doctor') await deleteDoctor(doctorId);
      else await deleteOccasion(id);
      doc.fields.messageTemplate = 'Final unsubmitted text';
      await saveOccasionFormDraft('draft', doctorId, id, doc, 1);
      await expect(commitOccasionFormDraft('draft', doctorId, id, 2, now)).rejects.toThrow();
      expect(draft().body).toBe(JSON.stringify(doc));
      expect(draft().deletedAt).toBeNull();
    },
  );

  it('fences save, commit, inspect, replace and delayed discard against a replaced dataset', async () => {
    const generation = datasetGeneration();
    await saveOccasionFormDraft('draft', doctorId, null, document(), 0, generation);
    const comparison = await inspectOccasionForm('draft', doctorId, null, generation);
    const before = draft();
    const replacement = reserveDatasetReplacement();
    replacement.committed();
    replacement.release();
    await expect(saveOccasionFormDraft('draft', doctorId, null, document(), 1, generation)).rejects.toThrow();
    await expect(commitOccasionFormDraft('draft', doctorId, null, 1, now, generation)).rejects.toThrow();
    await expect(inspectOccasionForm('draft', doctorId, null, generation)).rejects.toThrow();
    await expect(
      replaceOccasionFormDraft('draft', doctorId, null, document(), comparison, generation),
    ).rejects.toThrow();
    await expect(discardOccasionFormDraft('draft', doctorId, null, 1, generation)).rejects.toThrow();
    expect(draft()).toEqual(before);
    expect(t.db.select().from(occasions).all()).toEqual([]);
  });
});
