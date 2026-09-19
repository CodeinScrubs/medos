import { z } from 'zod';

/**
 * The first entry inside every backup: what it contains and where it came
 * from. It is parsed from a file the user picked, so it is validated rather
 * than trusted — a damaged or foreign file must fail here, clearly, before
 * anything on the phone is touched.
 */
export const backupManifest = z.object({
  app: z.literal('MedOS'),
  appVersion: z.string().nullable(),
  createdAt: z.string().datetime(),
  schemaMigrations: z.number().int().min(0),
  includesMedia: z.boolean(),
  counts: z.record(z.string(), z.number().int().min(0)),
  mediaFiles: z.number().int().min(0),
  mediaBytes: z.number().min(0),
  device: z.string().nullable(),
});

export type BackupManifest = z.infer<typeof backupManifest>;

export class InvalidManifestError extends Error {}

export function parseManifest(value: unknown): BackupManifest {
  const result = backupManifest.safeParse(value);
  if (!result.success) {
    throw new InvalidManifestError('فهرست محتوای این بکاپ خوانا نیست؛ فایل آسیب دیده یا مال MedOS نیست.');
  }
  return result.data;
}
