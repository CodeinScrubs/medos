import { and, asc, eq, getTableColumns, inArray, isNull, ne, or, sql } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import {
  attachments,
  captureInbox,
  doctors,
  encounters,
  labPanels,
  noteDrafts,
  patients,
  photoImportBatches,
  type PhotoImportBatch,
} from '@/db/schema';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { withDatasetWrite, datasetGeneration } from '@/lib/dataset-write';
import { assertFileWorkAvailable, withFileJob } from '@/lib/file-work';
import { newId, softDelete, stamps, touch } from '@/lib/ids';
import { imageMimeFromPath } from '@/lib/image-edit';
import { parsePhotoImportBody, photoImportPath, type PhotoImportBody, type PhotoFileRole } from '@/lib/photo-import';
import { fingerprintFile, fingerprintSourceFile, type FileFingerprint } from '@/platform/file-integrity';
import { copyPhotoImportFile, extensionOf, mediaFile, mediaUri, renderPhotoDerivative } from '@/platform/media';

import type { AttachTarget } from './capture';
import { addAttachmentInTransaction, attachmentPatientInTransaction, type AttachmentTarget } from './queries';

export type PhotoSourceAsset = { uri: string; width: number; height: number; mimeType?: string | null };
const running = new Map<string, Promise<string[]>>();

function conflict(): never {
  throw new Error('مقصد یا وضعیت ورود عکس تغییر کرده است؛ فایل‌ها حفظ شده‌اند.');
}

function bodyOf(row: PhotoImportBatch): PhotoImportBody {
  if (
    !Number.isFinite(row.capturedAt.getTime()) ||
    !['attachment', 'lab_panel'].includes(row.mode) ||
    (row.mode === 'lab_panel' && (row.entityType !== 'lab_panel' || !row.patientId || row.kind !== 'lab_sheet'))
  )
    conflict();
  return parsePhotoImportBody(row.body, row.id);
}

function same(a: PhotoImportBatch, b: PhotoImportBatch): boolean {
  return (
    (
      [
        'id',
        'entityType',
        'entityId',
        'patientId',
        'mode',
        'kind',
        'caption',
        'bodySite',
        'encounterId',
        'body',
        'state',
        'revision',
      ] as const
    ).every((key) => a[key] === b[key]) &&
    a.capturedAt.getTime() === b.capturedAt.getTime() &&
    a.updatedAt.getTime() === b.updatedAt.getTime() &&
    a.createdAt.getTime() === b.createdAt.getTime() &&
    a.deletedAt?.getTime() === b.deletedAt?.getTime()
  );
}

function current(tx: DbTransaction, expected: PhotoImportBatch): PhotoImportBatch {
  const row = tx.select().from(photoImportBatches).where(eq(photoImportBatches.id, expected.id)).get();
  if (!row || row.deletedAt || !same(row, expected)) conflict();
  bodyOf(row);
  requireOwner(tx, row);
  return row;
}

function requireOwner(tx: DbTransaction, row: PhotoImportBatch): void {
  const target: AttachmentTarget =
    row.mode === 'lab_panel' && row.state !== 'saved'
      ? { entityType: 'patient', entityId: row.patientId!, patientId: row.patientId }
      : row;
  if (attachmentPatientInTransaction(tx, target) !== row.patientId) conflict();
  if (row.entityType === 'capture') {
    const capture = tx.select().from(captureInbox).where(eq(captureInbox.id, row.entityId)).get();
    if (!capture || capture.filedAt) conflict();
  }
  if (row.mode === 'lab_panel' && row.encounterId) {
    const encounter = tx.select().from(encounters).where(eq(encounters.id, row.encounterId)).get();
    if (!encounter || encounter.deletedAt || encounter.patientId !== row.patientId) conflict();
  }
}

export function photoImportBatchQuery(id: string) {
  return db.select().from(photoImportBatches).where(eq(photoImportBatches.id, id)).limit(1);
}

export function pendingPhotoImportsQuery({
  patientId,
  target,
}: { patientId?: string; target?: AttachmentTarget } = {}) {
  return db
    .select({
      ...getTableColumns(photoImportBatches),
      firstName: patients.firstName,
      lastName: patients.lastName,
      doctorFirstName: doctors.firstName,
      doctorLastName: doctors.lastName,
    })
    .from(photoImportBatches)
    .leftJoin(patients, and(eq(patients.id, photoImportBatches.patientId), isNull(patients.deletedAt)))
    .leftJoin(
      doctors,
      and(
        eq(photoImportBatches.entityType, 'doctor'),
        eq(doctors.id, photoImportBatches.entityId),
        isNull(doctors.deletedAt),
      ),
    )
    .where(
      and(
        isNull(photoImportBatches.deletedAt),
        ne(photoImportBatches.state, 'saved'),
        ne(photoImportBatches.state, 'discarded'),
        patientId ? eq(photoImportBatches.patientId, patientId) : undefined,
        target ? eq(photoImportBatches.entityType, target.entityType) : undefined,
        target ? eq(photoImportBatches.entityId, target.entityId) : undefined,
      ),
    )
    .orderBy(asc(photoImportBatches.createdAt), asc(photoImportBatches.id));
}

/** Identity, selected inputs and first source destinations commit before native reads/copies. */
export function beginPhotoImport(
  assets: PhotoSourceAsset[],
  target: AttachTarget,
  keepOriginal: boolean,
  now: Date,
  lab = false,
  originalEncounterId?: string | null,
): PhotoImportBatch {
  assertFileWorkAvailable();
  if (!assets.length || assets.length > 20 || !Number.isFinite(now.getTime()) || target.entityType === 'note_draft')
    conflict();
  const id = newId();
  const paths: string[] = [];
  const fingerprints: PhotoImportBody['fingerprints'] = {};
  const body: PhotoImportBody = {
    version: 1,
    keepOriginal,
    paths,
    fingerprints,
    assets: assets.map((asset, index) => {
      const extension = extensionOf(asset.uri, 'jpg');
      const path = photoImportPath(id, index, 'source', newId(), extension);
      paths.push(path);
      fingerprints[path] = null;
      return {
        sourceUri: asset.uri,
        sourceWidth: asset.width,
        sourceHeight: asset.height,
        extension,
        originalMimeType: asset.mimeType ?? imageMimeFromPath(asset.uri) ?? null,
        source: { path, fingerprint: null },
        full: { path: null, fingerprint: null },
        thumb: { path: null, fingerprint: null },
        width: null,
        height: null,
        attachmentId: null,
      };
    }),
  };
  parsePhotoImportBody(JSON.stringify(body), id);
  return db.transaction((tx) => {
    const patientId = attachmentPatientInTransaction(tx, target);
    if (lab && (target.entityType !== 'patient' || !patientId || target.kind !== 'lab_sheet')) conflict();
    const entityId = lab ? newId() : target.entityId;
    tx.insert(photoImportBatches)
      .values({
        id,
        ...stamps(now),
        entityType: lab ? 'lab_panel' : target.entityType,
        entityId,
        patientId,
        mode: lab ? 'lab_panel' : 'attachment',
        kind: target.kind,
        caption: target.caption ?? null,
        bodySite: target.bodySite ?? null,
        capturedAt: now,
        body: JSON.stringify(body),
        encounterId: lab
          ? originalEncounterId === undefined
            ? resolveActiveEncounterId(patientId!, tx)
            : originalEncounterId
          : null,
      })
      .run();
    const row = tx.select().from(photoImportBatches).where(eq(photoImportBatches.id, id)).get()!;
    requireOwner(tx, row);
    return row;
  });
}

function change(expected: PhotoImportBatch, body: PhotoImportBody, now: Date, state?: 'ready'): PhotoImportBatch {
  assertFileWorkAvailable();
  parsePhotoImportBody(JSON.stringify(body), expected.id);
  return db.transaction((tx) => {
    const row = current(tx, expected);
    if (row.state !== 'copying' || body.assets.some((item) => item.attachmentId)) conflict();
    tx.update(photoImportBatches)
      .set({ body: JSON.stringify(body), state: state ?? row.state, revision: row.revision + 1, ...touch(now) })
      .where(eq(photoImportBatches.id, row.id))
      .run();
    return tx.select().from(photoImportBatches).where(eq(photoImportBatches.id, row.id)).get()!;
  });
}

function equalFingerprint(a: FileFingerprint | null, b: FileFingerprint): boolean {
  return a?.checksum === b.checksum && a.sizeBytes === b.sizeBytes;
}

function requireUnreferencedCopy(tx: DbTransaction, row: PhotoImportBatch, path: string): void {
  current(tx, row);
  if (
    tx
      .select({ id: attachments.id })
      .from(attachments)
      .where(
        or(eq(attachments.relativePath, path), eq(attachments.originalPath, path), eq(attachments.thumbnailPath, path)),
      )
      .get() ||
    tx
      .select({ id: noteDrafts.id })
      .from(noteDrafts)
      .where(
        sql`EXISTS (SELECT 1 FROM json_each(${noteDrafts.voices}) AS voice
        WHERE json_extract(voice.value, '$.relativePath') = ${path})`,
      )
      .get()
  )
    conflict();
}

async function matchesStored(path: string | null, expected: FileFingerprint | null): Promise<boolean> {
  if (!path || !expected) return false;
  try {
    return equalFingerprint(expected, await fingerprintFile(() => mediaFile(path)));
  } catch {
    return false;
  }
}

/** Retrying a partial copy reserves another path; every older attempt stays accounted for. */
function reserveAttempt(
  row: PhotoImportBatch,
  index: number,
  role: PhotoFileRole,
  fingerprint: FileFingerprint,
  now: Date,
  dimensions?: { width: number; height: number },
): PhotoImportBatch {
  const body = bodyOf(row);
  const item = body.assets[index]!;
  const previous = item[role].path;
  const path =
    previous && !mediaFile(previous).exists
      ? previous
      : photoImportPath(row.id, index, role, newId(), role === 'source' ? item.extension : 'jpg');
  if (!body.paths.includes(path)) body.paths.push(path);
  body.fingerprints[path] = fingerprint;
  item[role] = { path, fingerprint };
  if (dimensions) {
    item.width = dimensions.width;
    item.height = dimensions.height;
  }
  return change(row, body, now);
}

async function ensureSource(row: PhotoImportBatch, index: number, now: Date): Promise<PhotoImportBatch> {
  let item = bodyOf(row).assets[index]!;
  if (await matchesStored(item.source.path, item.source.fingerprint)) {
    db.transaction((tx) => current(tx, row));
    return row;
  }
  const fingerprint = await fingerprintSourceFile(item.sourceUri);
  if (item.source.fingerprint && !equalFingerprint(item.source.fingerprint, fingerprint))
    throw new Error('فایل اولیهٔ عکس تغییر کرده است؛ فایل‌های موجود جایگزین نشدند.');
  row = reserveAttempt(row, index, 'source', fingerprint, now);
  item = bodyOf(row).assets[index]!;
  db.transaction((tx) => requireUnreferencedCopy(tx, row, item.source.path!));
  await copyPhotoImportFile(item.sourceUri, item.source.path!);
  if (!(await matchesStored(item.source.path, fingerprint)))
    throw new Error('کپی عکس با فایل اولیه یکسان نیست؛ ثبت نشد.');
  db.transaction((tx) => current(tx, row));
  return row;
}

async function ensureDerivative(
  row: PhotoImportBatch,
  index: number,
  role: 'full' | 'thumb',
  now: Date,
): Promise<PhotoImportBatch> {
  let item = bodyOf(row).assets[index]!;
  if (await matchesStored(item[role].path, item[role].fingerprint)) {
    db.transaction((tx) => current(tx, row));
    return row;
  }
  if (!(await matchesStored(item.source.path, item.source.fingerprint)))
    throw new Error('کپی اولیهٔ عکس کامل نیست یا تغییر کرده است؛ ثبت نشد.');
  db.transaction((tx) => current(tx, row));
  const rendered = await renderPhotoDerivative(
    { uri: mediaUri(item.source.path)!, width: item.sourceWidth, height: item.sourceHeight },
    role === 'thumb',
  );
  const fingerprint = await fingerprintSourceFile(rendered.uri);
  row = reserveAttempt(row, index, role, fingerprint, now, role === 'full' ? rendered : undefined);
  item = bodyOf(row).assets[index]!;
  db.transaction((tx) => requireUnreferencedCopy(tx, row, item[role].path!));
  await copyPhotoImportFile(rendered.uri, item[role].path!);
  if (!(await matchesStored(item[role].path, fingerprint))) throw new Error('کپی عکس کامل نیست؛ ثبت نشد.');
  db.transaction((tx) => current(tx, row));
  return row;
}

async function verifyBatch(row: PhotoImportBatch): Promise<void> {
  for (const item of bodyOf(row).assets) {
    for (const role of ['source', 'full', 'thumb'] as const) {
      if (!(await matchesStored(item[role].path, item[role].fingerprint)))
        throw new Error('فایل عکس کامل نیست یا تغییر کرده است؛ ثبت دوباره انجام نشد.');
      db.transaction((tx) => current(tx, row));
    }
    if (!item.width || !item.height) conflict();
  }
}

/** Whole batch and optional new photo-only panel publish in the same synchronous transaction. */
function publish(expected: PhotoImportBatch, now: Date): string[] {
  return db.transaction((tx) => {
    const row = current(tx, expected);
    const body = bodyOf(row);
    if (row.state === 'saved') {
      return body.assets.map((item) => {
        const attachment =
          item.attachmentId && tx.select().from(attachments).where(eq(attachments.id, item.attachmentId)).get();
        if (
          !attachment ||
          attachment.deletedAt ||
          attachment.entityType !== row.entityType ||
          attachment.entityId !== row.entityId ||
          attachment.patientId !== row.patientId ||
          attachment.kind !== row.kind ||
          attachment.relativePath !== item.full.path ||
          attachment.thumbnailPath !== item.thumb.path ||
          attachment.originalPath !== (body.keepOriginal ? item.source.path : null) ||
          attachment.checksum !== item.full.fingerprint?.checksum ||
          attachment.sizeBytes !== item.full.fingerprint?.sizeBytes ||
          attachment.width !== item.width ||
          attachment.height !== item.height ||
          attachment.capturedAt?.getTime() !== row.capturedAt.getTime()
        )
          conflict();
        return attachment.id;
      });
    }
    if (row.state !== 'ready' || body.assets.some((item) => item.attachmentId)) conflict();
    const ownedPaths = new Set(body.paths);
    if (
      tx
        .select({ id: attachments.id })
        .from(attachments)
        .where(
          or(
            inArray(attachments.relativePath, [...ownedPaths]),
            inArray(attachments.thumbnailPath, [...ownedPaths]),
            inArray(attachments.originalPath, [...ownedPaths]),
          ),
        )
        .get()
    )
      conflict();
    if (row.mode === 'lab_panel') {
      if (tx.select({ id: labPanels.id }).from(labPanels).where(eq(labPanels.id, row.entityId)).get()) conflict();
      tx.insert(labPanels)
        .values({
          id: row.entityId,
          ...stamps(row.createdAt),
          patientId: row.patientId!,
          encounterId: row.encounterId,
          collectedAt: row.capturedAt,
          name: 'عکس برگه',
          source: 'photo',
        })
        .run();
    }
    const ids = body.assets.map((item) => {
      if (!item.full.path || !item.thumb.path || !item.full.fingerprint || !item.source.path) conflict();
      const id = addAttachmentInTransaction(tx, {
        entityType: row.entityType,
        entityId: row.entityId,
        patientId: row.patientId,
        kind: row.kind,
        relativePath: item.full.path,
        thumbnailPath: item.thumb.path,
        originalPath: body.keepOriginal ? item.source.path : null,
        originalMimeType: body.keepOriginal ? item.originalMimeType : null,
        checksum: item.full.fingerprint.checksum,
        sizeBytes: item.full.fingerprint.sizeBytes,
        mimeType: 'image/jpeg',
        width: item.width,
        height: item.height,
        caption: row.caption,
        bodySite: row.bodySite,
        capturedAt: row.capturedAt,
      });
      item.attachmentId = id;
      return id;
    });
    if (row.entityType === 'capture')
      tx.update(captureInbox)
        .set({ kind: 'photo', ...touch(now) })
        .where(eq(captureInbox.id, row.entityId))
        .run();
    tx.update(photoImportBatches)
      .set({ state: 'saved', body: JSON.stringify(body), revision: row.revision + 1, ...touch(now) })
      .where(eq(photoImportBatches.id, row.id))
      .run();
    return ids;
  });
}

async function run(expected: PhotoImportBatch, now: Date): Promise<string[]> {
  const existing = running.get(expected.id);
  if (existing) return existing;
  const work = (async () => {
    let row = expected;
    if (row.state === 'copying') {
      // Preserve every selected source before generating the first derivative.
      for (let i = 0; i < bodyOf(row).assets.length; i++) row = await ensureSource(row, i, now);
      for (let i = 0; i < bodyOf(row).assets.length; i++) {
        row = await ensureDerivative(row, i, 'full', now);
        row = await ensureDerivative(row, i, 'thumb', now);
      }
      row = change(row, bodyOf(row), now, 'ready');
    }
    await verifyBatch(row);
    return publish(row, now);
  })();
  running.set(expected.id, work);
  try {
    return await work;
  } finally {
    if (running.get(expected.id) === work) running.delete(expected.id);
  }
}

export async function persistPhotoImport(
  assets: PhotoSourceAsset[],
  target: AttachTarget,
  keepOriginal: boolean,
  now: Date,
  generation = datasetGeneration(),
  lab = false,
  originalEncounterId?: string | null,
): Promise<string[]> {
  return withDatasetWrite(generation, () =>
    withFileJob(() => run(beginPhotoImport(assets, target, keepOriginal, now, lab, originalEncounterId), now)),
  );
}

export async function resumePhotoImport(id: string, now: Date, generation: number): Promise<string[]> {
  return withDatasetWrite(generation, () =>
    withFileJob(() => {
      const row = photoImportBatchQuery(id).get();
      if (!row || row.deletedAt || row.state === 'discarded') conflict();
      db.transaction((tx) => current(tx, row));
      return run(row, now);
    }),
  );
}

/** Explicit soft retirement only; preserve sources, partial copies and all clinical references. */
export async function discardPhotoImport(id: string, now: Date, generation: number): Promise<void> {
  return withDatasetWrite(generation, () =>
    withFileJob(async () => {
      db.transaction((tx) => {
        const row = tx.select().from(photoImportBatches).where(eq(photoImportBatches.id, id)).get();
        if (!row || row.state === 'saved' || bodyOf(row).assets.some((item) => item.attachmentId)) conflict();
        if (row.state === 'discarded') return;
        tx.update(photoImportBatches)
          .set({ state: 'discarded', ...softDelete(now), revision: row.revision + 1 })
          .where(eq(photoImportBatches.id, id))
          .run();
      });
      await audit('photo_import.discarded', { entityType: 'photo_import_batch', entityId: id });
      await running.get(id)?.catch(() => undefined);
    }),
  );
}
