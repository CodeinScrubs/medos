import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { restoreDatabase } from '@/db/client';
import { attachments, imageEditDrafts, imageEditVersions } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { reserveDatasetReplacement } from '@/lib/dataset-write';
import { decodeImageDraft, ImageEditConflict, type ImageDraftDocument } from '@/lib/image-edit';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import {
  discardImageEditDraft,
  imageEditQuery,
  imageEditSeed,
  imageShelvedDraftsQuery,
  imageVersionsQuery,
  inspectImageEdit,
  loadImageHistoryBody,
  publishImageEditDraft,
  resolveImageEdit,
  saveImageEditDraft,
  type ImageEditSeed,
} from './image-edit-queries';
import { addAttachment, deleteAttachment, updateAttachment } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase, patientId: string, attachmentId: string, seed: ImageEditSeed;
const draftId = 'synthetic-image-draft';
function edited(): ImageDraftDocument {
  return {
    version: 1,
    image: {
      ...seed.document.image,
      rotation: 1,
      marks: [
        {
          id: 'synthetic-mark',
          kind: 'text',
          color: 'red',
          x: 20,
          y: 30,
          width: 350,
          size: 25,
          text: 'ضایعه ECG 12.5',
        },
      ],
    },
    pendingText: null,
  };
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Image' });
  attachmentId = await addAttachment({
    entityType: 'patient',
    entityId: patientId,
    patientId,
    kind: 'clinical_photo',
    relativePath: 'media/synthetic/grid.jpg',
    originalPath: 'media/synthetic/original.png',
    thumbnailPath: 'media/synthetic/thumb.jpg',
    width: 640,
    height: 480,
    mimeType: 'image/jpeg',
    sizeBytes: 400,
  });
  seed = imageEditSeed(imageEditQuery(attachmentId).get()!);
});

describe('image draft and publication consistency', () => {
  it('lists compact history and loads only the chosen large version or retired raw draft', async () => {
    const large = edited();
    large.image.marks = Array.from({ length: 200 }, (_, i) => ({
      id: `large-${i}`,
      kind: 'text' as const,
      color: 'red' as const,
      x: 20,
      y: 30,
      width: 350,
      size: 25,
      text: 'X'.repeat(2000),
    }));
    await saveImageEditDraft(draftId, seed.basis, large, 0);
    const versionId = await publishImageEditDraft(draftId, seed.basis, 1);
    const versions = imageVersionsQuery(attachmentId).all();
    expect(versions.map((row) => row.revision)).toEqual([1, 0]);
    expect(JSON.stringify(versions).length).toBeLessThan(1000);
    const body = loadImageHistoryBody(attachmentId, versionId, 'version');
    expect(body.length).toBeGreaterThan(400000);
    expect(JSON.parse(body)).toEqual(large.image);

    const next = imageEditSeed(imageEditQuery(attachmentId).get()!);
    const pendingText = {
      id: 'raw-shelf',
      x: 20,
      y: 30,
      width: 350,
      size: 25,
      color: 'red' as const,
      text: '  Raw shelf\n',
    };
    await saveImageEditDraft('shelf', next.basis, { ...large, pendingText }, 0);
    await discardImageEditDraft('shelf', next.basis, 1);
    const shelves = imageShelvedDraftsQuery(attachmentId).all();
    expect(shelves).toHaveLength(1);
    expect(JSON.stringify(shelves).length).toBeLessThan(1000);
    expect(decodeImageDraft(loadImageHistoryBody(attachmentId, 'shelf', 'draft')).pendingText?.text).toBe(
      '  Raw shelf\n',
    );
  });
  it('does not load foreign, deleted, active or committed history rows by id', async () => {
    await saveImageEditDraft(draftId, seed.basis, edited(), 0);
    expect(() => loadImageHistoryBody(attachmentId, draftId, 'draft')).toThrow(ImageEditConflict);
    const versionId = await publishImageEditDraft(draftId, seed.basis, 1);
    expect(() => loadImageHistoryBody(attachmentId, draftId, 'draft')).toThrow(ImageEditConflict);
    expect(() => loadImageHistoryBody('other-attachment', versionId, 'version')).toThrow(ImageEditConflict);
    t.db
      .update(imageEditVersions)
      .set({ deletedAt: new Date(1) })
      .where(eq(imageEditVersions.id, versionId))
      .run();
    expect(() => loadImageHistoryBody(attachmentId, versionId, 'version')).toThrow(ImageEditConflict);
    expect(() => loadImageHistoryBody(attachmentId, 'missing', 'version')).toThrow(ImageEditConflict);
  });
  it('clears new image history/drafts and applies defaults when restoring a table-absent old backup', async () => {
    t.sqlite.exec("VACUUM INTO '/old-image-schema.db'");
    await saveImageEditDraft(draftId, seed.basis, edited(), 0);
    await publishImageEditDraft(draftId, seed.basis, 1);
    const replacement = reserveDatasetReplacement(),
      trusted = restoreDatabase(replacement);
    try {
      trusted.sqlite.execSync('PRAGMA foreign_keys = OFF');
      trusted.sqlite.execSync("ATTACH DATABASE '/old-image-schema.db' AS restore_src");
      try {
        trusted.sqlite.execSync(
          'DROP TABLE restore_src.image_edit_drafts; DROP TABLE restore_src.image_edit_versions; ALTER TABLE restore_src.attachments DROP COLUMN image_edit_body; ALTER TABLE restore_src.attachments DROP COLUMN image_edit_revision; ALTER TABLE restore_src.attachments DROP COLUMN original_mime_type;',
        );
        importTables(trusted.sqlite);
      } finally {
        trusted.sqlite.execSync('DETACH DATABASE restore_src');
        trusted.sqlite.execSync('PRAGMA foreign_keys = ON');
      }
      replacement.committed();
    } finally {
      replacement.release();
    }
    expect(t.db.select().from(imageEditDrafts).all()).toEqual([]);
    expect(t.db.select().from(imageEditVersions).all()).toEqual([]);
    expect(t.db.select().from(attachments).get()).toEqual(
      expect.objectContaining({
        id: attachmentId,
        originalPath: 'media/synthetic/original.png',
        originalMimeType: null,
        imageEditBody: null,
        imageEditRevision: 0,
      }),
    );
  });
  it.each(['local', 'stored'] as const)(
    'resolves an explicitly compared conflict using %s while shelving both exact branches',
    async (choice) => {
      const stored = edited(),
        local = {
          ...edited(),
          pendingText: {
            id: 'unfinished',
            x: 50,
            y: 50,
            size: 24,
            width: 250,
            color: 'blue' as const,
            text: 'Exact unsaved local text',
          },
        };
      await saveImageEditDraft(draftId, seed.basis, stored, 0);
      const shown = await inspectImageEdit(seed.basis);
      const next = await resolveImageEdit(seed.basis, local, shown, choice);
      expect(next.document).toEqual(choice === 'local' ? local : stored);
      expect(imageEditSeed(imageEditQuery(attachmentId).get()!).document).toEqual(next.document);
      const shelves = t.db
        .select()
        .from(imageEditDrafts)
        .all()
        .filter((row) => row.deletedAt);
      expect(shelves.some((row) => decodeImageDraft(row.body).pendingText?.text === 'Exact unsaved local text')).toBe(
        true,
      );
      expect(
        shelves.some((row) => row.id === draftId && decodeImageDraft(row.body).image.marks[0]!.id === 'synthetic-mark'),
      ).toBe(true);
      expect(t.db.select().from(attachments).get()!.imageEditRevision).toBe(0);
    },
  );
  it('rejects a conflict decision when the compared version changes again', async () => {
    await saveImageEditDraft(draftId, seed.basis, edited(), 0);
    const shown = await inspectImageEdit(seed.basis);
    await saveImageEditDraft(draftId, seed.basis, { ...edited(), image: { ...edited().image, rotation: 2 } }, 1);
    await expect(resolveImageEdit(seed.basis, edited(), shown, 'local')).rejects.toThrow(ImageEditConflict);
    expect(t.db.select().from(imageEditDrafts).all()).toHaveLength(1);
  });
  it('cold reads exact unfinished text and marks without changing the clinical image', async () => {
    const value = edited();
    value.pendingText = {
      id: 'typing',
      x: 100,
      y: 100,
      width: 200,
      size: 24,
      color: 'blue',
      text: '  هنوز تمام نشده ECG\n12.5  ',
    };
    expect(await saveImageEditDraft(draftId, seed.basis, value, 0)).toBe(1);
    const reopened = imageEditSeed(imageEditQuery(attachmentId).get()!);
    expect(reopened.document).toEqual(value);
    expect(t.db.select().from(attachments).get()!.imageEditBody).toBeNull();
    await expect(publishImageEditDraft(draftId, seed.basis, 1)).rejects.toThrow('تأیید');
    expect(t.db.select().from(imageEditVersions).all()).toHaveLength(0);
  });
  it('atomically publishes, preserves baseline/history and retries acknowledgement without duplicating', async () => {
    await saveImageEditDraft(draftId, seed.basis, edited(), 0);
    const id = await publishImageEditDraft(draftId, seed.basis, 1);
    expect(await publishImageEditDraft(draftId, seed.basis, 1)).toBe(id);
    const a = t.db.select().from(attachments).get()!;
    expect(a).toMatchObject({
      relativePath: 'media/synthetic/grid.jpg',
      originalPath: 'media/synthetic/original.png',
      thumbnailPath: 'media/synthetic/thumb.jpg',
      imageEditRevision: 1,
    });
    expect(
      t.db
        .select()
        .from(imageEditVersions)
        .all()
        .map((v) => v.revision),
    ).toEqual([0, 1]);
    expect(t.db.select().from(imageEditDrafts).get()!.deletedAt).not.toBeNull();
    expect(imageEditQuery(attachmentId).get()!.draft).toBeNull();
  });
  it.each(['version', 'attachment', 'retirement'] as const)(
    'rolls back the entire publication when %s fails',
    async (phase) => {
      await saveImageEditDraft(draftId, seed.basis, edited(), 0);
      const sql = {
        version: 'BEFORE INSERT ON image_edit_versions',
        attachment: 'BEFORE UPDATE ON attachments',
        retirement: 'BEFORE UPDATE ON image_edit_drafts',
      }[phase];
      t.sqlite.exec(`CREATE TRIGGER fail_image ${sql} BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END;`);
      await expect(publishImageEditDraft(draftId, seed.basis, 1)).rejects.toThrow();
      expect(t.db.select().from(attachments).get()!.imageEditRevision).toBe(0);
      expect(t.db.select().from(imageEditVersions).all()).toHaveLength(0);
      expect(t.db.select().from(imageEditDrafts).get()!.deletedAt).toBeNull();
      t.sqlite.exec('DROP TRIGGER fail_image');
      await expect(publishImageEditDraft(draftId, seed.basis, 1)).resolves.toBeTruthy();
    },
  );
  it('rejects stale draft writers and a competing draft without dropping either value', async () => {
    await saveImageEditDraft(draftId, seed.basis, edited(), 0);
    await expect(saveImageEditDraft(draftId, seed.basis, { ...edited(), pendingText: null }, 0)).rejects.toThrow(
      ImageEditConflict,
    );
    await expect(saveImageEditDraft('competing', seed.basis, edited(), 0)).rejects.toThrow(ImageEditConflict);
    expect(decodeImageDraft(t.db.select().from(imageEditDrafts).get()!.body)).toEqual(edited());
  });
  it('rejects publication after the base revision changes, but retains its draft', async () => {
    await saveImageEditDraft(draftId, seed.basis, edited(), 0);
    t.db.update(attachments).set({ imageEditRevision: 4 }).where(eq(attachments.id, attachmentId)).run();
    await expect(publishImageEditDraft(draftId, seed.basis, 1)).rejects.toThrow(ImageEditConflict);
    expect(t.db.select().from(imageEditDrafts).get()!.deletedAt).toBeNull();
  });
  it('allows an independent caption update without falsely conflicting or losing it', async () => {
    await saveImageEditDraft(draftId, seed.basis, edited(), 0);
    await updateAttachment(attachmentId, { caption: 'Independent caption' });
    await publishImageEditDraft(draftId, seed.basis, 1);
    expect(t.db.select().from(attachments).get()!.caption).toBe('Independent caption');
  });
  it.each(['patient', 'attachment'] as const)(
    'retains final draft text but cannot publish after deleting its %s',
    async (target) => {
      if (target === 'patient') await deletePatient(patientId);
      else await deleteAttachment(attachmentId);
      await saveImageEditDraft(draftId, seed.basis, edited(), 0);
      await expect(publishImageEditDraft(draftId, seed.basis, 1)).rejects.toThrow();
      expect(t.db.select().from(imageEditDrafts).get()!.body).toBeTruthy();
      expect(t.db.select().from(imageEditVersions).all()).toHaveLength(0);
    },
  );
  it('does not redirect an old draft into a rebound attachment or a different source', async () => {
    t.db
      .update(attachments)
      .set({ relativePath: 'media/synthetic/other.jpg' })
      .where(eq(attachments.id, attachmentId))
      .run();
    await expect(saveImageEditDraft(draftId, seed.basis, edited(), 0)).rejects.toThrow(ImageEditConflict);
    expect(t.db.select().from(imageEditDrafts).all()).toHaveLength(0);
  });
  it('soft-discard retains exact draft bytes and refuses a stale discard', async () => {
    await saveImageEditDraft(draftId, seed.basis, edited(), 0);
    await expect(discardImageEditDraft(draftId, seed.basis, 0)).rejects.toThrow(ImageEditConflict);
    const body = t.db.select().from(imageEditDrafts).get()!.body;
    await discardImageEditDraft(draftId, seed.basis, 1);
    expect(t.db.select().from(imageEditDrafts).get()).toMatchObject({ body, revision: 2 });
    expect(t.db.select().from(imageEditDrafts).get()!.deletedAt).not.toBeNull();
  });
  it('reverting creates another revision and preserves every older version', async () => {
    await saveImageEditDraft(draftId, seed.basis, edited(), 0);
    await publishImageEditDraft(draftId, seed.basis, 1);
    const next = imageEditSeed(imageEditQuery(attachmentId).get()!);
    await saveImageEditDraft('next', next.basis, { version: 1, image: seed.document.image, pendingText: null }, 0);
    await publishImageEditDraft('next', next.basis, 1);
    expect(
      t.db
        .select()
        .from(imageEditVersions)
        .all()
        .map((v) => v.revision),
    ).toEqual([0, 1, 2]);
    expect(t.db.select().from(attachments).get()!.imageEditRevision).toBe(2);
  });
});
