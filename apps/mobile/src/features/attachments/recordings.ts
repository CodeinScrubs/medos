import type { Recording } from '@/components/voice-recorder';
import { extensionOf, storeFile, type StoredFile } from '@/platform/media';

type StoredRecording = StoredFile & { capturedAt: Date };
const staged = new WeakMap<Recording, { uri: string; durationMs: number; work: Promise<StoredRecording> }>();

/**
 * Retain the source until its metadata is acknowledged. One stopped recording
 * shares one copy through simultaneous callers and SQL retries; a failed copy
 * may retry. This in-process handoff is not a process-death recovery journal.
 */
export function stageRecording(recording: Recording, now: Date): Promise<StoredRecording> {
  if (!recording.uri || !Number.isSafeInteger(recording.durationMs) || recording.durationMs < 500)
    return Promise.reject(new Error('اطلاعات وویس معتبر نیست؛ فایل ثبت نشد.'));
  const previous = staged.get(recording);
  if (previous) {
    if (previous.uri !== recording.uri || previous.durationMs !== recording.durationMs)
      return Promise.reject(new Error('اطلاعات وویس تغییر کرده است؛ دوباره ضبط کنید.'));
    return previous.work;
  }
  const work = (async () => {
    const capturedAt = new Date(recording.capturedAt ?? now);
    if (!Number.isFinite(capturedAt.getTime())) throw new Error('زمان ضبط معتبر نیست؛ فایل ثبت نشد.');
    const stored = await storeFile(recording.uri, extensionOf(recording.uri, 'm4a'), { verifySize: true });
    if (stored.sizeBytes == null || !Number.isSafeInteger(stored.sizeBytes) || stored.sizeBytes <= 0)
      throw new Error('فایل وویس کامل ذخیره نشد؛ نسخهٔ اولیه حفظ شده است.');
    return { ...stored, capturedAt };
  })();
  const entry = { uri: recording.uri, durationMs: recording.durationMs, work };
  staged.set(recording, entry);
  void work.catch(() => {
    if (staged.get(recording) === entry) staged.delete(recording);
  });
  return work;
}
