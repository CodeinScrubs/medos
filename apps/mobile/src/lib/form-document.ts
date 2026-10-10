import { z, type ZodType } from 'zod';

/** Only shipped codecs belong here; adding a form does not require a new store. */
export type WorkspaceFormKind = 'idea' | 'topic' | 'order';

export type FormDocument<T> = {
  version: 1;
  kind: WorkspaceFormKind;
  /** Immutable feature-owned context key, not a user/tenant. Notebooks have none. */
  parentId: string | null;
  recordId: string | null;
  scope: string;
  /** Complete published basis captured before typing; null means creating. */
  basis: string | null;
  fields: T;
};

export class UnsupportedFormDraft extends Error {
  constructor() {
    super('پیش‌نویس قابل خواندن نیست؛ متن اصلی آن را نگه دارید یا کپی کنید.');
  }
}

export class FormDraftConflict extends Error {
  constructor() {
    super('پیش‌نویس یا رکورد تغییر کرده است؛ پیش از ثبت دوباره آن را مرور کنید.');
  }
}

/** JSON tuples keep null/new and even imported literal "new" IDs distinct. */
export function formScope(recordId: string | null, parentId: string | null = null): string {
  return JSON.stringify([parentId, recordId]);
}

/** Stable equality without timestamps alone, hashes, text folding or trimmed fields. */
export function formBasis(value: unknown): string {
  function visit(input: unknown): unknown {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (input instanceof Date) return visit(input.getTime());
    if (Array.isArray(input)) return input.map(visit);
    if (typeof input === 'object' && input !== null) {
      const prototype = Object.getPrototypeOf(input);
      if (prototype !== Object.prototype && prototype !== null) throw new UnsupportedFormDraft();
      return Object.fromEntries(
        Object.entries(input)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, item]) => [key, visit(item)]),
      );
    }
    throw new UnsupportedFormDraft();
  }
  return JSON.stringify(visit(value));
}

export type FormCodec<T> = {
  readonly kind: WorkspaceFormKind;
  create(input: {
    recordId: string | null;
    parentId?: string | null;
    basis: string | null;
    fields: T;
  }): FormDocument<T>;
  decode(body: string): FormDocument<T>;
  encode(document: FormDocument<T>): string;
};

/** Feature-owned strict field schemas must preserve partial/invalid raw strings. */
export function formCodec<T>(kind: WorkspaceFormKind, fields: ZodType<T>): FormCodec<T> {
  const identifier = z.string().min(1).nullable();
  const schema = z
    .object({
      version: z.literal(1),
      kind: z.literal(kind),
      parentId: identifier,
      recordId: identifier,
      scope: z.string(),
      basis: z.string().nullable(),
      fields: z.unknown(),
    })
    .strict();
  function parse(value: unknown): FormDocument<T> {
    const result = schema.safeParse(value);
    if (!result.success) throw new UnsupportedFormDraft();
    const document = result.data;
    const raw = fields.safeParse(document.fields);
    if (
      !raw.success ||
      document.scope !== formScope(document.recordId, document.parentId) ||
      (document.recordId === null) !== (document.basis === null)
    )
      throw new UnsupportedFormDraft();
    return { ...document, fields: raw.data };
  }
  return {
    kind,
    create(input) {
      const parentId = input.parentId ?? null;
      return parse({ version: 1, kind, ...input, parentId, scope: formScope(input.recordId, parentId) });
    },
    decode(body) {
      let value: unknown;
      try {
        value = JSON.parse(body);
      } catch {
        throw new UnsupportedFormDraft();
      }
      return parse(value);
    },
    encode(document) {
      return formBasis(parse(document));
    },
  };
}
