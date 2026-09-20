import { z } from 'zod';

import type { AttachmentKind } from '@/db/schema';
import { defineSetting } from '@/db/settings';

/**
 * Whether a photo's own bytes are kept beside the stored copy.
 *
 * Every photo is re-encoded to 2400px JPEG on the way in, which is the right
 * size for a chart and the wrong size for the two jobs that need the sensor's
 * own pixels: zooming into a lesion followed over weeks, and comparing two
 * ECGs. The re-encode cannot be undone, so the choice has to be made before
 * the photo is stored, not when it is finally needed.
 *
 * The default splits it by what the photo is of: skin and imaging keep their
 * originals, paperwork does not. A lab sheet gains nothing from 12 megabytes.
 */
export const KEEP_ORIGINAL_KINDS: readonly AttachmentKind[] = ['clinical_photo', 'radiology'];

export const keepOriginalsMode = defineSetting(
  'media.keepOriginals',
  z.enum(['clinical', 'always', 'never']),
  'clinical',
);

export type KeepOriginalsMode = z.infer<typeof keepOriginalsMode.schema>;

export function shouldKeepOriginal(mode: KeepOriginalsMode, kind: AttachmentKind): boolean {
  if (mode === 'always') return true;
  if (mode === 'never') return false;
  return KEEP_ORIGINAL_KINDS.includes(kind);
}
