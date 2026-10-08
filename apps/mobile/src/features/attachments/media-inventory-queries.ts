import { db } from '@/db/client';
import { attachments, callImports, noteDrafts, photoImportBatches, recordingJobs } from '@/db/schema';
import { reserveFileMaintenance } from '@/lib/file-work';
import { parsePhotoImportBody } from '@/lib/photo-import';
import { listStoredMedia } from '@/platform/media';

type Reference = 'attachment' | 'attachment_trash' | 'note_draft' | 'recording_job' | 'call_import' | 'photo_import';
export type MediaInventory = {
  files: { path: string; sizeBytes: number | null; references: Reference[] }[];
  missing: { path: string; references: Reference[] }[];
  protectedCount: number;
  unreferencedCount: number;
  unreferencedBytes: number;
  unknownSizeCount: number;
};

/** Accounting only. Unknown journal metadata fails closed instead of authorizing reclamation. */
export function inspectMediaInventory(): MediaInventory {
  const release = reserveFileMaintenance();
  try {
    const references = new Map<string, Set<Reference>>();
    const protect = (path: string | null | undefined, reason: Reference) => {
      if (!path) return;
      const reasons = references.get(path) ?? new Set<Reference>();
      reasons.add(reason);
      references.set(path, reasons);
    };
    // Soft-deleted rows and retired journals still protect original/recoverable bytes.
    for (const row of db
      .select({
        relativePath: attachments.relativePath,
        originalPath: attachments.originalPath,
        thumbnailPath: attachments.thumbnailPath,
        deletedAt: attachments.deletedAt,
      })
      .from(attachments)
      .all()) {
      const reason = row.deletedAt ? 'attachment_trash' : 'attachment';
      protect(row.relativePath, reason);
      protect(row.originalPath, reason);
      protect(row.thumbnailPath, reason);
    }
    for (const row of db.select({ voices: noteDrafts.voices }).from(noteDrafts).all())
      for (const voice of row.voices ?? []) protect(voice.relativePath, 'note_draft');
    for (const row of db.select({ relativePath: recordingJobs.relativePath }).from(recordingJobs).all())
      protect(row.relativePath, 'recording_job');
    for (const row of db.select({ relativePath: callImports.relativePath }).from(callImports).all())
      protect(row.relativePath, 'call_import');
    for (const row of db
      .select({ id: photoImportBatches.id, body: photoImportBatches.body })
      .from(photoImportBatches)
      .all())
      for (const path of parsePhotoImportBody(row.body, row.id).paths) protect(path, 'photo_import');
    const files = listStoredMedia().map((file) => ({ ...file, references: [...(references.get(file.path) ?? [])] }));
    const present = new Set(files.map((file) => file.path));
    const missing = [...references]
      .filter(([path]) => !present.has(path))
      .map(([path, reasons]) => ({ path, references: [...reasons] }));
    const unreferenced = files.filter((file) => !file.references.length);
    return {
      files,
      missing,
      protectedCount: files.length - unreferenced.length,
      unreferencedCount: unreferenced.length,
      unreferencedBytes: unreferenced.reduce((sum, file) => sum + (file.sizeBytes ?? 0), 0),
      unknownSizeCount: files.filter((file) => file.sizeBytes === null).length,
    };
  } finally {
    release();
  }
}
