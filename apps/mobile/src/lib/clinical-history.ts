import { formBasis } from './form-document';

export const CLINICAL_HISTORY_KINDS = [
  'patient',
  'contact',
  'encounter',
  'diagnosis',
  'vital',
  'lab',
  'imaging',
  'order',
  'consult',
  'followup',
] as const;
export type ClinicalHistoryKind = (typeof CLINICAL_HISTORY_KINDS)[number];

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type HistoryRow = { fields: Record<string, JsonValue>; dates: string[] };
export type ClinicalSnapshot = {
  version: 1;
  kind: ClinicalHistoryKind;
  record: HistoryRow;
  /** A lab header alone cannot describe the results before an edit. */
  values?: HistoryRow[];
};

// Unpublished input and native reminder receipts have their own recovery stores.
// They must not become clinical truth or create a permanent version per keystroke.
const UNPUBLISHED_OR_NATIVE = new Set([
  'draftResponse',
  'draftInstruction',
  'draftRevision',
  'notificationId',
  'reminderRevision',
  'reminderAppliedRevision',
  'scheduleDraft',
  'scheduleDraftRevision',
]);

export function isClinicalHistoryKind(value: unknown): value is ClinicalHistoryKind {
  return typeof value === 'string' && CLINICAL_HISTORY_KINDS.some((kind) => kind === value);
}

function historyRow(row: Record<string, unknown>): HistoryRow {
  const dates: string[] = [];
  const fields = Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !UNPUBLISHED_OR_NATIVE.has(key))
      .map(([key, value]) => {
        if (value instanceof Date) {
          dates.push(key);
          return [key, value.getTime()];
        }
        return [key, value];
      }),
  );
  // Reject unsupported values with a fixed message; never log clinical text.
  const encoded = formBasis(fields);
  return { fields: JSON.parse(encoded) as HistoryRow['fields'], dates: dates.sort() };
}

export function clinicalSnapshot(
  kind: ClinicalHistoryKind,
  record: Record<string, unknown>,
  values?: Record<string, unknown>[],
): ClinicalSnapshot {
  return { version: 1, kind, record: historyRow(record), ...(values ? { values: values.map(historyRow) } : {}) };
}

export function encodeClinicalSnapshot(snapshot: ClinicalSnapshot): string {
  return formBasis(snapshot);
}

/** Unsupported/future documents stay stored and copyable; never rewrite them. */
export function decodeClinicalSnapshot(
  body: string,
  owner?: { kind: string; recordId: string; patientId: string },
): ClinicalSnapshot | null {
  try {
    const value: unknown = JSON.parse(body);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    if (candidate.version !== 1 || !isClinicalHistoryKind(candidate.kind)) return null;
    const row = (input: unknown): input is HistoryRow => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
      const record = input as Record<string, unknown>;
      if (
        !record.fields ||
        typeof record.fields !== 'object' ||
        Array.isArray(record.fields) ||
        !Array.isArray(record.dates)
      )
        return false;
      const fields = record.fields as Record<string, unknown>;
      return (
        typeof fields.id === 'string' &&
        record.dates.every(
          (key: unknown) =>
            typeof key === 'string' &&
            typeof fields[key] === 'number' &&
            Number.isSafeInteger(fields[key]) &&
            Math.abs(fields[key]) <= 8640000000000000,
        )
      );
    };
    if (!row(candidate.record)) return null;
    if (
      candidate.values !== undefined &&
      (candidate.kind !== 'lab' || !Array.isArray(candidate.values) || !candidate.values.every(row))
    )
      return null;
    // JSON.parse cannot create functions/undefined; this also rejects non-finite numbers.
    formBasis(candidate);
    const snapshot = candidate as ClinicalSnapshot;
    if (
      owner &&
      (snapshot.kind !== owner.kind ||
        snapshot.record.fields.id !== owner.recordId ||
        (snapshot.kind === 'patient' ? snapshot.record.fields.id : snapshot.record.fields.patientId) !==
          owner.patientId ||
        snapshot.values?.some(
          (value) => value.fields.panelId !== owner.recordId || value.fields.patientId !== owner.patientId,
        ))
    )
      return null;
    return snapshot;
  } catch {
    return null;
  }
}

/** Compare clinical content, independently of index rebuilds and touch timestamps. */
export function clinicalSnapshotContent(snapshot: ClinicalSnapshot): string {
  const row = (input: HistoryRow, child = false) => ({
    fields: Object.fromEntries(
      Object.entries(input.fields).filter(
        ([key]) => !['createdAt', 'updatedAt', 'searchText'].includes(key) && !(child && key === 'id'),
      ),
    ),
    dates: input.dates.filter((key) => key !== 'createdAt' && key !== 'updatedAt'),
  });
  return formBasis({
    kind: snapshot.kind,
    record: row(snapshot.record),
    ...(snapshot.values ? { values: snapshot.values.map((value) => row(value, true)) } : {}),
  });
}
