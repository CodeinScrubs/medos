import { z } from 'zod';

export const importIdIsValid = (id: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);

const sourceSchema = z
  .object({
    version: z.literal(1),
    uri: z.string().min(1),
    name: z.string(),
    sizeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
    recordedAt: z.number().int().min(-8_640_000_000_000_000).max(8_640_000_000_000_000).nullable(),
    timeSource: z.enum(['filename', 'file', 'unknown']),
    who: z.string().nullable(),
    key: z.string(),
  })
  .strict();

export type CallRecording = {
  uri: string;
  name: string;
  sizeBytes: number | null;
  recordedAt: Date | null;
  timeSource: 'filename' | 'file' | 'unknown';
  who: string | null;
  /** Legacy filename hint, not an import identity. */
  key: string;
  /** Stable for one share/pick/request, including retries. */
  importId?: string;
};

export function encodeCallSource(source: CallRecording): string {
  const parsed = sourceSchema.safeParse({
    version: 1,
    uri: source.uri,
    name: source.name,
    sizeBytes: source.sizeBytes,
    recordedAt: source.recordedAt && Number.isFinite(source.recordedAt.getTime()) ? source.recordedAt.getTime() : null,
    timeSource: source.timeSource,
    who: source.who,
    key: source.key,
  });
  if (!parsed.success) throw new Error('اطلاعات فایل معتبر نیست.');
  return JSON.stringify(parsed.data);
}

export function decodeCallSource(body: string): CallRecording {
  try {
    const result = sourceSchema.safeParse(JSON.parse(body));
    if (result.success) {
      const { recordedAt, ...source } = result.data;
      return { ...source, recordedAt: recordedAt == null ? null : new Date(recordedAt) };
    }
  } catch {
    /* The source URI/name can contain private data. */
  }
  throw new Error('اطلاعات ورود فایل خوانده نشد؛ نسخهٔ اصلی حفظ شده است.');
}

export function importMediaPath(id: string, extension: string): string {
  if (!importIdIsValid(id) || !/^[a-z0-9]{1,5}$/.test(extension)) throw new Error('شناسهٔ ورود فایل معتبر نیست.');
  return `media/imports/${id}.${extension}`;
}

export function assertImportMediaPath(id: string, path: string): void {
  const extension = path.split('.').at(-1) ?? '';
  if (path !== importMediaPath(id, extension)) throw new Error('مسیر ورود فایل معتبر نیست.');
}
