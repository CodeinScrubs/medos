import { z } from 'zod';

import { normalizePhone } from '@/lib/persian';

const fields = z
  .object({ name: z.string(), relation: z.string().nullable(), phone: z.string(), notes: z.string() })
  .strict();
const schema = z.object({ version: z.literal(1), fields }).strict();
export type ContactFormFields = z.infer<typeof fields>;
export type ContactFormDocument = z.infer<typeof schema>;
export const initialContactForm = (): ContactFormDocument => ({
  version: 1,
  fields: { name: '', relation: null, phone: '', notes: '' },
});

export class ContactFormConflict extends Error {
  constructor() {
    super('پیش‌نویس همراه در صفحهٔ دیگری تغییر کرده است؛ نوشتهٔ این صفحه نگه داشته شد.');
    this.name = 'ContactFormConflict';
  }
}
export function decodeContactForm(body: string): ContactFormDocument {
  try {
    return schema.parse(JSON.parse(body));
  } catch {
    throw new Error('پیش‌نویس همراه قابل خواندن نیست؛ اطلاعات ذخیره‌شده تغییر نکرد.');
  }
}
export function encodeContactForm(document: ContactFormDocument): string {
  return JSON.stringify(schema.parse(document));
}
export function contactFormValues(document: ContactFormDocument) {
  const f = schema.parse(document).fields;
  const phone = normalizePhone(f.phone);
  if (!phone) throw new Error('شماره تماس لازم است؛ پیش‌نویس نگه داشته شد.');
  if (phone.length < 8) throw new Error('شماره تماس کامل نیست؛ پیش‌نویس نگه داشته شد.');
  return {
    name: f.name.trim() || undefined,
    relation: f.relation ?? undefined,
    phone,
    notes: f.notes.trim() || undefined,
  };
}
