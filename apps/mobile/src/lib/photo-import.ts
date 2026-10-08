import { z } from 'zod';

const fingerprint = z
  .object({ checksum: z.string().regex(/^[a-f0-9]{64}$/), sizeBytes: z.number().int().positive().safe() })
  .strict();
const stored = z.object({ path: z.string().nullable(), fingerprint: fingerprint.nullable() }).strict();
const asset = z
  .object({
    sourceUri: z.string().regex(/^(file|content):\/\//),
    sourceWidth: z.number().int().positive(),
    sourceHeight: z.number().int().positive(),
    extension: z.string().regex(/^[a-z0-9]{1,5}$/),
    originalMimeType: z.string().nullable(),
    source: stored,
    full: stored,
    thumb: stored,
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    attachmentId: z.string().uuid().nullable(),
  })
  .strict();

const bodySchema = z
  .object({
    version: z.literal(1),
    keepOriginal: z.boolean(),
    assets: z.array(asset).min(1).max(20),
    /** All attempts remain owned/accounted for, including failed partial copies. */
    paths: z.array(z.string()),
    fingerprints: z.record(fingerprint.nullable()),
  })
  .strict();

export type PhotoImportBody = z.infer<typeof bodySchema>;
export type PhotoImportAsset = PhotoImportBody['assets'][number];
export type PhotoFileRole = 'source' | 'full' | 'thumb';

export function photoImportPath(
  batchId: string,
  index: number,
  role: PhotoFileRole,
  attemptId: string,
  extension: string,
) {
  if (
    !z.string().uuid().safeParse(batchId).success ||
    !z.string().uuid().safeParse(attemptId).success ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index >= 20 ||
    !/^[a-z0-9]{1,5}$/.test(extension)
  )
    throw new Error('اطلاعات ورود عکس معتبر نیست؛ فایل‌ها حفظ شده‌اند.');
  return `media/imports/photo-${batchId}-${index}-${role}-${attemptId}.${extension}`;
}

export function parsePhotoImportBody(raw: string, batchId: string): PhotoImportBody {
  try {
    const body = bodySchema.parse(JSON.parse(raw));
    if (
      !z.string().uuid().safeParse(batchId).success ||
      new Set(body.paths).size !== body.paths.length ||
      Object.keys(body.fingerprints).length !== body.paths.length ||
      body.paths.some((path) => !(path in body.fingerprints))
    )
      throw new Error();
    const seen = new Set<string>();
    for (const [i, item] of body.assets.entries()) {
      for (const role of ['source', 'full', 'thumb'] as const) {
        const file = item[role];
        if (
          (file.path === null) !== (file.fingerprint === null) &&
          !(role === 'source' && file.path && !file.fingerprint)
        )
          throw new Error();
        if (file.path) {
          if (seen.has(file.path) || !body.paths.includes(file.path)) throw new Error();
          if (JSON.stringify(body.fingerprints[file.path]) !== JSON.stringify(file.fingerprint)) throw new Error();
          seen.add(file.path);
          const extension = role === 'source' ? item.extension : 'jpg';
          const prefix = `media/imports/photo-${batchId}-${i}-${role}-`;
          if (!file.path.startsWith(prefix) || !file.path.endsWith(`.${extension}`)) throw new Error();
        }
      }
      if ((item.width === null) !== (item.height === null)) throw new Error();
    }
    const pattern = new RegExp(
      `^media/imports/photo-${batchId}-([0-9]+)-(source|full|thumb)-([a-f0-9-]+)\\.([a-z0-9]{1,5})$`,
    );
    for (const path of body.paths) {
      const match = pattern.exec(path);
      if (!match || !z.string().uuid().safeParse(match[3]).success) throw new Error();
      const index = parseInt(match[1]!, 10);
      if (
        index >= body.assets.length ||
        String(index) !== match[1] ||
        match[4] !== (match[2] === 'source' ? body.assets[index]!.extension : 'jpg')
      )
        throw new Error();
    }
    return body;
  } catch {
    throw new Error('اطلاعات ورود عکس کامل خوانده نشد؛ هیچ فایلی تغییر نکرد.');
  }
}
