import { z } from 'zod';

import type { Credential } from '@/db/schema';
import { dateInputText, validateDateInput } from '@/lib/date-input';
import { formCodec } from '@/lib/form-document';
import { fromIsoDate } from '@/lib/jalali';
import { sameDay } from '@/lib/time';

const fields = z
  .object({
    systemName: z.string(),
    category: z.enum(['prescription', 'insurance', 'hospital', 'university', 'lab', 'personal', 'other']),
    url: z.string(),
    username: z.string(),
    secret: z.string(),
    clearSecret: z.boolean(),
    secondFactorNotes: z.string(),
    ownerKind: z.enum(['self', 'colleague', 'shared']),
    ownerName: z.string(),
    ownerConsentNote: z.string(),
    notes: z.string(),
    tags: z.string(),
    expiresValue: z.number().finite().nullable(),
    expiresText: z.string(),
    starred: z.boolean(),
  })
  .strict();
export type CredentialFormFields = z.infer<typeof fields>;
export const credentialFormCodec = formCodec('credential', fields);

/** Blank new-secret input preserves an existing secret; clear is an explicit intent. */
export function initialCredentialFields(row: Credential | null): CredentialFormFields {
  return {
    systemName: row?.systemName ?? '',
    category: row?.category ?? 'prescription',
    url: row?.url ?? '',
    username: row?.username ?? '',
    secret: '',
    clearSecret: false,
    secondFactorNotes: row?.secondFactorNotes ?? '',
    ownerKind: row?.ownerKind ?? 'self',
    ownerName: row?.ownerName ?? '',
    ownerConsentNote: row?.ownerConsentNote ?? '',
    notes: row?.notes ?? '',
    tags: (row?.tags ?? []).join('، '),
    expiresValue: row?.expiresAt?.getTime() ?? null,
    expiresText: row?.expiresAt ? dateInputText(row.expiresAt) : '',
    starred: row?.starred ?? false,
  };
}
export function credentialExpiry(raw: CredentialFormFields, now: Date): Date | null {
  const result = validateDateInput(raw.expiresText, { required: false, allowFuture: true, now });
  if (!result.valid) throw new Error('تاریخ انقضا را کامل و معتبر وارد کنید.');
  const day = fromIsoDate(result.iso);
  if (!day) return null;
  const original = raw.expiresValue === null ? null : new Date(raw.expiresValue);
  // An unrelated edit must not truncate an existing time/seconds/milliseconds.
  return original && sameDay(original, day) ? original : day;
}
export function credentialFormInput(raw: CredentialFormFields, now: Date, creating: boolean) {
  const { secret, clearSecret, expiresText: _text, expiresValue: _value, tags, ...rest } = raw;
  if (secret && clearSecret) throw new Error('برای حذف رمز، کادر رمز جدید را خالی کنید.');
  return {
    ...rest,
    tags: tags
      .split(/[,،]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
    expiresAt: credentialExpiry(raw, now),
    ...(clearSecret ? { secret: '' } : secret || creating ? { secret } : {}),
  };
}
