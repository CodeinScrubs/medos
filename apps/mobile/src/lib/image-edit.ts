import { z } from 'zod';

/** Image coordinates are physical pixels, never RTL layout coordinates. */
export const IMAGE_COLORS = ['yellow', 'red', 'blue', 'white', 'black'] as const;
export type ImageColor = (typeof IMAGE_COLORS)[number];
export const MAX_IMAGE_MARKS = 200;
export const MAX_IMAGE_POINTS = 20000;
const MAX_DOCUMENT_CHARS = 2000000;
const scalar = z.number().finite();
const point = z.object({ x: scalar.nonnegative(), y: scalar.nonnegative() }).strict();
const rect = point.extend({ width: scalar.positive(), height: scalar.positive() }).strict();
const common = {
  id: z.string().min(1).max(80),
  color: z.enum(IMAGE_COLORS),
};
const mark = z.discriminatedUnion('kind', [
  z
    .object({
      ...common,
      kind: z.enum(['pen', 'highlight']),
      width: scalar.positive(),
      points: z.array(point).min(1).max(4000),
    })
    .strict(),
  z.object({ ...common, kind: z.literal('arrow'), width: scalar.positive(), start: point, end: point }).strict(),
  z
    .object({
      ...common,
      kind: z.literal('text'),
      x: scalar.nonnegative(),
      y: scalar.nonnegative(),
      size: scalar.positive(),
      width: scalar.positive(),
      text: z.string().min(1).max(2000),
    })
    .strict(),
]);
const documentSchema = z
  .object({
    version: z.literal(1),
    sourcePath: z
      .string()
      .max(512)
      .regex(/^media\/[a-zA-Z0-9_./-]+$/)
      .refine((path) => !path.split('/').includes('..')),
    width: scalar.positive().max(16384),
    height: scalar.positive().max(16384),
    crop: rect,
    rotation: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    marks: z.array(mark).max(MAX_IMAGE_MARKS),
  })
  .strict();
export type ImagePoint = z.infer<typeof point>;
export type ImageRect = z.infer<typeof rect>;
export type ImageMark = z.infer<typeof mark>;
export type ImageDocument = z.infer<typeof documentSchema>;
export type PendingImageText = {
  id: string;
  x: number;
  y: number;
  width: number;
  size: number;
  color: ImageColor;
  text: string;
};
export type ImageDraftDocument = { version: 1; image: ImageDocument; pendingText: PendingImageText | null };

export class ImageEditConflict extends Error {
  constructor(message = 'نسخهٔ عکس یا پیش‌نویس تغییر کرده است؛ ویرایش شما روی صفحه نگه داشته شد.') {
    super(message);
  }
}

export function initialImageDocument(sourcePath: string, width: number, height: number): ImageDocument {
  return validateImageDocument({
    version: 1,
    sourcePath,
    width,
    height,
    crop: { x: 0, y: 0, width, height },
    rotation: 0,
    marks: [],
  });
}

/** Corrupt or newer documents must not silently turn into an unedited image. */
export function validateImageDocument(value: unknown): ImageDocument {
  const doc = documentSchema.parse(value);
  const inside = (p: ImagePoint) => p.x <= doc.width && p.y <= doc.height;
  const c = doc.crop;
  if (!inside(c) || c.x + c.width > doc.width + 0.001 || c.y + c.height > doc.height + 0.001)
    throw new Error('کادر برش خارج از عکس است.');
  let points = 0;
  if (new Set(doc.marks.map((m) => m.id)).size !== doc.marks.length) throw new Error('شناسهٔ علامت‌ها تکراری است.');
  for (const m of doc.marks) {
    if (m.kind === 'text') {
      if (!inside(m) || m.size > Math.max(doc.width, doc.height) || m.width > doc.width)
        throw new Error('محدودهٔ نوشته معتبر نیست.');
    } else {
      const ps = m.kind === 'arrow' ? [m.start, m.end] : m.points;
      points += ps.length;
      if (ps.some((p) => !inside(p)) || m.width > Math.min(doc.width, doc.height))
        throw new Error('محدودهٔ علامت معتبر نیست.');
    }
  }
  if (points > MAX_IMAGE_POINTS)
    throw new Error('علامت‌ها زیاد شده‌اند؛ یک نسخه ذخیره کنید و علامت‌های اضافی را بردارید.');
  return doc;
}

export function decodeImageDocument(body: string): ImageDocument {
  if (body.length > MAX_DOCUMENT_CHARS) throw new Error('سند ویرایش عکس بیش از اندازه بزرگ است.');
  return validateImageDocument(JSON.parse(body));
}
export function encodeImageDocument(value: ImageDocument): string {
  const body = JSON.stringify(validateImageDocument(value));
  if (body.length > MAX_DOCUMENT_CHARS) throw new Error('سند ویرایش عکس بیش از اندازه بزرگ است.');
  return body;
}
const pendingSchema = z
  .object({ ...common, ...point.shape, width: scalar.positive(), size: scalar.positive(), text: z.string().max(2000) })
  .strict();
export function decodeImageDraft(body: string): ImageDraftDocument {
  if (body.length > MAX_DOCUMENT_CHARS + 20000) throw new Error('پیش‌نویس عکس بیش از اندازه بزرگ است.');
  return validateImageDraft(JSON.parse(body));
}
export function validateImageDraft(value: unknown): ImageDraftDocument {
  const draft = z
    .object({ version: z.literal(1), image: documentSchema, pendingText: pendingSchema.nullable() })
    .strict()
    .parse(value);
  encodeImageDocument(draft.image);
  const p = draft.pendingText;
  if (
    p &&
    (p.x > draft.image.width ||
      p.y > draft.image.height ||
      p.width > draft.image.width ||
      p.size > Math.max(draft.image.width, draft.image.height))
  )
    throw new Error('محدودهٔ نوشته معتبر نیست.');
  return draft;
}
export function encodeImageDraft(value: ImageDraftDocument): string {
  const body = JSON.stringify(validateImageDraft(value));
  if (body.length > MAX_DOCUMENT_CHARS + 20000) throw new Error('پیش‌نویس عکس بیش از اندازه بزرگ است.');
  return body;
}

export function pointSegmentDistance(point: ImagePoint, start: ImagePoint, end: ImagePoint): number {
  const dx = end.x - start.x,
    dy = end.y - start.y,
    length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length)) : 0;
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy);
}
export function textMarkHeight(mark: Extract<ImageMark, { kind: 'text' }>): number {
  // Conservative Latin/Persian character estimate for hit testing only;
  // Android StaticLayout owns actual shaping/wrapping and exported pixels.
  const perLine = Math.max(1, Math.floor(mark.width / (mark.size * 0.65)));
  const lines = mark.text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0);
  return mark.size * 1.5 * lines;
}

export function imageDisplaySize(doc: Pick<ImageDocument, 'crop' | 'rotation'>) {
  return doc.rotation % 2 === 0
    ? { width: doc.crop.width, height: doc.crop.height }
    : { width: doc.crop.height, height: doc.crop.width };
}
export function imageMatrix({ crop: c, rotation }: Pick<ImageDocument, 'crop' | 'rotation'>): string {
  switch (rotation) {
    case 0:
      return `matrix(1 0 0 1 ${-c.x} ${-c.y})`;
    case 1:
      return `matrix(0 1 -1 0 ${c.height + c.y} ${-c.x})`;
    case 2:
      return `matrix(-1 0 0 -1 ${c.width + c.x} ${c.height + c.y})`;
    case 3:
      return `matrix(0 -1 1 0 ${-c.y} ${c.width + c.x})`;
  }
}
export function sourceToDisplay(p: ImagePoint, doc: Pick<ImageDocument, 'crop' | 'rotation'>): ImagePoint {
  const x = p.x - doc.crop.x,
    y = p.y - doc.crop.y;
  switch (doc.rotation) {
    case 0:
      return { x, y };
    case 1:
      return { x: doc.crop.height - y, y: x };
    case 2:
      return { x: doc.crop.width - x, y: doc.crop.height - y };
    case 3:
      return { x: y, y: doc.crop.width - x };
  }
}
export function displayToSource(p: ImagePoint, doc: Pick<ImageDocument, 'crop' | 'rotation'>): ImagePoint {
  const c = doc.crop;
  switch (doc.rotation) {
    case 0:
      return { x: p.x + c.x, y: p.y + c.y };
    case 1:
      return { x: p.y + c.x, y: c.height - p.x + c.y };
    case 2:
      return { x: c.width - p.x + c.x, y: c.height - p.y + c.y };
    case 3:
      return { x: c.width - p.y + c.x, y: p.x + c.y };
  }
}

export function containedImageRect(
  viewWidth: number,
  viewHeight: number,
  imageWidth: number,
  imageHeight: number,
): ImageRect {
  'worklet';
  const ratio = Math.min(viewWidth / imageWidth, viewHeight / imageHeight);
  const width = imageWidth * ratio,
    height = imageHeight * ratio;
  return { x: (viewWidth - width) / 2, y: (viewHeight - height) / 2, width, height };
}
export function imagePanBound(imageExtent: number, viewportExtent: number, scale: number): number {
  'worklet';
  return Math.max(0, (imageExtent * scale - viewportExtent) / 2);
}
/** Invert contain + centered zoom/pan, then crop/rotation. Letterbox taps are ignored. */
export function viewportToSource(
  p: ImagePoint,
  doc: ImageDocument,
  viewport: { width: number; height: number },
  zoom = 1,
  tx = 0,
  ty = 0,
): ImagePoint | null {
  const size = imageDisplaySize(doc);
  const fit = containedImageRect(viewport.width, viewport.height, size.width, size.height);
  const x = (p.x - viewport.width / 2 - tx) / zoom + viewport.width / 2;
  const y = (p.y - viewport.height / 2 - ty) / zoom + viewport.height / 2;
  if (x < fit.x || y < fit.y || x > fit.x + fit.width || y > fit.y + fit.height) return null;
  return displayToSource(
    { x: ((x - fit.x) / fit.width) * size.width, y: ((y - fit.y) / fit.height) * size.height },
    doc,
  );
}
export function cropBetween(a: ImagePoint, b: ImagePoint, doc: ImageDocument): ImageRect | null {
  const x = Math.max(0, Math.min(a.x, b.x)),
    y = Math.max(0, Math.min(a.y, b.y));
  const width = Math.min(doc.width, Math.max(a.x, b.x)) - x,
    height = Math.min(doc.height, Math.max(a.y, b.y)) - y;
  // An accidental tap must not produce a one-pixel "photo".
  return width >= Math.min(20, doc.width / 10) && height >= Math.min(20, doc.height / 10)
    ? { x, y, width, height }
    : null;
}

/** Path types are verified metadata when available; unknown originals get no invented MIME. */
export function imageMimeFromPath(path: string): string | undefined {
  const extension = path.split('.').pop()?.toLowerCase();
  return {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    gif: 'image/gif',
  }[extension ?? ''];
}
