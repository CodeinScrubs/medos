import { File, Paths } from 'expo-file-system';

import { fromBase64 } from '@/lib/crypto';
import { newId } from '@/lib/ids';

/** A share-only cache derivative. This never replaces a clinical image or its original. */
export function writeImageExport(base64: string, width: number, height: number): string {
  if (!base64 || base64.length > 32 * 1024 * 1024) throw new Error('خروجی عکس کامل دریافت نشد.');
  const bytes = fromBase64(base64);
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || png.some((n, i) => bytes[i] !== n)) throw new Error('فرمت خروجی عکس معتبر نیست.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // A valid header alone also accepts a truncated encoder response. Walk the
  // bounded PNG chunks and require image data and the final IEND before sharing.
  let offset = 8,
    data = false,
    ended = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) throw new Error('خروجی عکس ناقص است.');
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (offset === 8 && (type !== 'IHDR' || length !== 13)) throw new Error('فرمت خروجی عکس معتبر نیست.');
    if (type === 'IDAT' && length > 0) data = true;
    offset += length + 12;
    if (type === 'IEND') {
      if (length !== 0 || offset !== bytes.length) throw new Error('خروجی عکس ناقص است.');
      ended = true;
      break;
    }
  }
  if (!data || !ended) throw new Error('خروجی عکس ناقص است.');
  if (view.getUint32(16) !== width || view.getUint32(20) !== height)
    throw new Error('ابعاد خروجی عکس با ویرایش یکسان نیست.');
  const file = new File(Paths.cache, `medos-image-${newId()}.png`);
  file.write(bytes);
  if (!file.exists || file.size !== bytes.length) throw new Error('خروجی عکس کامل ذخیره نشد.');
  const stored = file.bytesSync();
  if (stored.length !== bytes.length || stored.some((value, index) => value !== bytes[index]))
    throw new Error('خروجی عکس با فایل ذخیره‌شده یکسان نیست.');
  return file.uri;
}
