import { z } from 'zod';

const schema = z.object({ version: z.literal(1), text: z.string(), baseCaption: z.string().nullable() }).strict();
export type CaptionDocument = z.infer<typeof schema>;
export class CaptionConflict extends Error {
  constructor() {
    super('توضیح یا پیش‌نویس عکس تغییر کرده است؛ نوشتهٔ این صفحه نگه داشته شد.');
    this.name = 'CaptionConflict';
  }
}
export function decodeCaption(body: string): CaptionDocument {
  try {
    return schema.parse(JSON.parse(body));
  } catch {
    throw new Error('پیش‌نویس توضیح عکس خوانده نشد؛ داده تغییر نکرد.');
  }
}
export const encodeCaption = (document: CaptionDocument) => JSON.stringify(schema.parse(document));
