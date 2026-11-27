import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { credentials, workspaceFormDrafts, type Credential } from '@/db/schema';
import { openFormScope } from '@/features/workspace-forms/queries';
import type { FormPort } from '@/features/workspace-forms/types';
import { formScope } from '@/lib/form-document';

import {
  credentialFormCodec,
  credentialFormInput,
  initialCredentialFields,
  type CredentialFormFields,
} from './form-draft';
import { CREDENTIAL_CATEGORY_LABELS, CREDENTIAL_OWNER_LABELS } from './labels';
import { createCredentialInTransaction, updateCredentialInTransaction } from './queries';

export function credentialFormQuery(recordId: string | null, draftId: string | null = null) {
  return db
    .select({ scope: sql<string>`${formScope(recordId)}`, record: credentials, draft: workspaceFormDrafts })
    .from(sql`(select 1) as credential_seed`)
    .leftJoin(credentials, recordId === null ? sql`0` : eq(credentials.id, recordId))
    .leftJoin(
      workspaceFormDrafts,
      draftId === null
        ? openFormScope('credential', recordId)
        : and(
            eq(workspaceFormDrafts.id, draftId),
            eq(workspaceFormDrafts.kind, 'credential'),
            eq(workspaceFormDrafts.scope, formScope(recordId)),
          ),
    )
    .limit(1);
}
export const credentialFormPort: FormPort<Credential, CredentialFormFields> = {
  codec: credentialFormCodec,
  query: credentialFormQuery,
  read: (tx, id) => tx.select().from(credentials).where(eq(credentials.id, id)).get() ?? null,
  initial: initialCredentialFields,
  publish(tx, id, raw, now) {
    const input = credentialFormInput(raw, now, id === null);
    if (id === null) return createCredentialInTransaction(tx, input, now);
    updateCredentialInTransaction(tx, id, input, now);
    return id;
  },
  describeFields: describeCredentialFields,
  describeRecord: (row) =>
    `${describeCredentialFields(initialCredentialFields(row))}\nرمز فعلی: ${row.secretText ? 'ثبت شده' : row.secretCipher ? 'رمز‌شدهٔ قدیمی' : 'ثبت نشده'}`,
};
/** Comparisons and previews describe the entry, never echo a secret or ciphertext. */
export function describeCredentialFields(raw: CredentialFormFields): string {
  return [
    `سامانه: ${raw.systemName}`,
    `دسته: ${CREDENTIAL_CATEGORY_LABELS[raw.category]}`,
    `یوزرنیم: ${raw.username}`,
    `آدرس: ${raw.url}`,
    `رمز: ${raw.clearSecret ? 'درخواست پاک‌کردن' : raw.secret ? 'رمز جدید وارد شده' : 'بدون تغییر'}`,
    `ورود دو مرحله‌ای: ${raw.secondFactorNotes}`,
    `صاحب رمز: ${CREDENTIAL_OWNER_LABELS[raw.ownerKind]}`,
    raw.ownerName,
    raw.ownerConsentNote,
    raw.notes,
    `برچسب‌ها: ${raw.tags}`,
    `تاریخ انقضا: ${raw.expiresText}`,
    `ستاره‌دار: ${raw.starred ? 'بله' : 'خیر'}`,
  ]
    .filter(Boolean)
    .join('\n');
}
