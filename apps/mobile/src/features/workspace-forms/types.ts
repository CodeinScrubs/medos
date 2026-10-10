import type { DbTransaction } from '@/db/client';
import type { WorkspaceFormDraft } from '@/db/schema';
import type { FormCodec, FormDocument } from '@/lib/form-document';

export type FormRecord = { id: string; deletedAt: Date | null };
export type FormRow<R> = { scope: string; record: R | null; draft: WorkspaceFormDraft | null };
export type FormSeed<R, F> = FormRow<R> & { document: FormDocument<F> };
export type FormComparison<R> = FormRow<R> & { original: WorkspaceFormDraft | null };

/** All publication callbacks are synchronous and use the caller's transaction. */
export type FormPort<R extends FormRecord, F> = {
  codec: FormCodec<F>;
  query(recordId: string | null, draftId?: string | null): { then: Promise<FormRow<R>[]>['then'] };
  read(tx: DbTransaction, recordId: string): R | null;
  initial(record: R | null, now: Date): F;
  publish(tx: DbTransaction, recordId: string | null, fields: F, now: Date): string;
  describeRecord(record: R): string;
  describeFields(fields: F): string;
};
