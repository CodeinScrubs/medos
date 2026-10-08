import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { attachmentCaptionDrafts, attachments } from '@/db/schema';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { datasetGeneration, DatasetChangedError } from '@/lib/dataset-write';
import { databaseRows, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { CaptionConflict, decodeCaption } from './caption-draft';
import {
  commitCaptionDraft,
  discardCaptionDraft,
  inspectCaption,
  replaceCaptionDraft,
  saveCaptionDraft,
} from './caption-queries';
import { addAttachment, updateAttachment } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase;
let patientId: string;
let id: string;
const raw = () => ({ version: 1 as const, text: '  فارسی / English\n raw  ', baseCaption: 'Source' });
const draft = () => t.db.select().from(attachmentCaptionDrafts).get()!;
const attachment = () => t.db.select().from(attachments).get()!;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Caption' });
  id = await addAttachment({
    entityType: 'patient',
    entityId: patientId,
    patientId,
    kind: 'clinical_photo',
    relativePath: 'media/source.jpg',
    caption: 'Source',
  });
});
describe('caption raw journal', () => {
  it('creates nothing for untouched input, preserves exact raw edits without publication', async () => {
    const before = databaseRows(t);
    expect(await saveCaptionDraft('draft', id, { version: 1, text: 'Source', baseCaption: 'Source' }, 0)).toBe(0);
    expect(databaseRows(t)).toEqual(before);
    await saveCaptionDraft('draft', id, raw(), 0);
    expect(decodeCaption(draft().body)).toEqual(raw());
    expect(attachment().caption).toBe('Source');
  });
  it('publishes/retire atomically and replays without rewriting newer captions', async () => {
    await saveCaptionDraft('draft', id, raw(), 0);
    await commitCaptionDraft('draft', id, 1);
    expect(attachment().caption).toBe(raw().text.trim());
    expect(draft().deletedAt).not.toBeNull();
    await updateAttachment(id, { caption: 'Newer' });
    const once = databaseRows(t);
    await commitCaptionDraft('draft', id, 1);
    expect(databaseRows(t)).toEqual(once);
  });
  it('rolls back publication on failed draft retirement', async () => {
    await saveCaptionDraft('draft', id, raw(), 0);
    const before = databaseRows(t);
    t.sqlite.exec(
      "CREATE TRIGGER fail_caption BEFORE UPDATE ON attachment_caption_drafts BEGIN SELECT RAISE(ABORT, 'synthetic'); END",
    );
    await expect(commitCaptionDraft('draft', id, 1)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });
  it('requires comparison on changed caption and refuses an intervening third correction', async () => {
    await saveCaptionDraft('draft', id, raw(), 0);
    await updateAttachment(id, { caption: 'Other' });
    await expect(commitCaptionDraft('draft', id, 1)).rejects.toThrow(CaptionConflict);
    const shown = await inspectCaption('draft', id);
    await updateAttachment(id, { caption: 'Third' });
    await expect(replaceCaptionDraft('draft', id, raw(), shown)).rejects.toThrow(CaptionConflict);
    const next = await replaceCaptionDraft('draft', id, raw(), await inspectCaption('draft', id));
    await commitCaptionDraft(next.id, id, next.revision);
    expect(attachment().caption).toBe(raw().text.trim());
  });
  it('retains raw on a deleted parent but refuses publication and cross-target draft reuse', async () => {
    await deletePatient(patientId);
    await saveCaptionDraft('draft', id, raw(), 0);
    await expect(commitCaptionDraft('draft', id, 1)).rejects.toThrow();
    await expect(saveCaptionDraft('draft', 'other', raw(), 1)).rejects.toThrow(CaptionConflict);
    expect(attachment().caption).toBe('Source');
  });
  it('soft discards only expected revision, no source deletion, stale dataset token refuses', async () => {
    await saveCaptionDraft('draft', id, raw(), 0);
    const generation = datasetGeneration();
    snapshotDataset(t)();
    const before = databaseRows(t);
    await expect(discardCaptionDraft('draft', id, 1, generation)).rejects.toThrow(DatasetChangedError);
    expect(databaseRows(t)).toEqual(before);
    await expect(discardCaptionDraft('draft', id, 0)).rejects.toThrow(CaptionConflict);
    await discardCaptionDraft('draft', id, 1);
    expect(draft().deletedAt).not.toBeNull();
    expect(attachment().relativePath).toBe('media/source.jpg');
  });
});
