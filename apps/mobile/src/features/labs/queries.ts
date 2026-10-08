import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import { db, type DbTransaction } from '@/db/client';
import { labPanels, labValues, patients, type LabPanel } from '@/db/schema';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { computeFlag, parseLabValue } from './flags';

const panelAlive = isNull(labPanels.deletedAt);
const valueAlive = isNull(labValues.deletedAt);

export function patientLabPanelsQuery(patientId: string) {
  return db
    .select()
    .from(labPanels)
    .where(and(panelAlive, eq(labPanels.patientId, patientId)))
    .orderBy(desc(labPanels.collectedAt));
}

export function labPanelQuery(panelId: string) {
  return db
    .select()
    .from(labPanels)
    .where(and(panelAlive, eq(labPanels.id, panelId)))
    .limit(1);
}

export function panelValuesQuery(panelId: string) {
  return db
    .select()
    .from(labValues)
    .where(and(valueAlive, eq(labValues.panelId, panelId)))
    .orderBy(asc(labValues.sortOrder));
}

/** Every live value for a patient with its draw time — the flowsheet's raw material. */
export function patientLabValuesQuery(patientId: string) {
  return db
    .select({ value: labValues, collectedAt: labPanels.collectedAt, panelId: labPanels.id })
    .from(labValues)
    .innerJoin(labPanels, eq(labValues.panelId, labPanels.id))
    .where(and(valueAlive, panelAlive, eq(labValues.patientId, patientId)))
    .orderBy(desc(labPanels.collectedAt), asc(labValues.sortOrder));
}

/** One analyte over time, oldest first, for the trend chart. Case-insensitive on the name. */
export function analyteSeriesQuery(patientId: string, analyte: string) {
  return db
    .select({ value: labValues, collectedAt: labPanels.collectedAt })
    .from(labValues)
    .innerJoin(labPanels, eq(labValues.panelId, labPanels.id))
    .where(
      and(
        valueAlive,
        panelAlive,
        eq(labValues.patientId, patientId),
        sql`lower(${labValues.analyte}) = lower(${analyte})`,
      ),
    )
    .orderBy(asc(labPanels.collectedAt));
}

export type LabValueInput = {
  analyte: string;
  value: string;
  unit?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
  notes?: string | null;
};

export type LabPanelInput = {
  patientId: string;
  collectedAt: Date;
  name?: string | null;
  source: LabPanel['source'];
  labName?: string | null;
  notes?: string | null;
  values: LabValueInput[];
};

function valueRows(panelId: string, patientId: string, values: LabValueInput[], now: Date) {
  return values
    .filter((v) => v.analyte.trim() && v.value.trim())
    .map((v, i) => {
      const parsed = parseLabValue(v.value);
      return {
        id: newId(),
        ...stamps(now),
        panelId,
        patientId,
        analyte: v.analyte.trim(),
        value: v.value.trim(),
        valueNum: parsed?.value ?? null,
        unit: v.unit ?? null,
        refLow: v.refLow ?? null,
        refHigh: v.refHigh ?? null,
        flag: computeFlag(parsed, v.refLow, v.refHigh),
        notes: v.notes ?? null,
        sortOrder: i,
      };
    });
}

export async function createLabPanel(input: LabPanelInput): Promise<string> {
  return db.transaction((tx) =>
    createLabPanelInTransaction(tx, input, new Date(), resolveActiveEncounterId(input.patientId, tx)),
  );
}

function requirePatient(tx: DbTransaction, patientId: string) {
  if (
    !tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
      .get()
  )
    throw new Error('پروندهٔ بیمار در دسترس نیست؛ آزمایش ثبت نشد.');
}

/** Raw form publication calls these helpers in its own retirement transaction. */
export function createLabPanelInTransaction(
  tx: DbTransaction,
  input: LabPanelInput,
  now: Date,
  encounterId: string | null,
): string {
  requirePatient(tx, input.patientId);
  if (!Number.isFinite(input.collectedAt.getTime())) throw new Error('زمان نمونه‌گیری معتبر نیست.');
  const panelId = newId();
  const rows = valueRows(panelId, input.patientId, input.values, now);
  tx.insert(labPanels)
    .values({
      id: panelId,
      ...stamps(now),
      patientId: input.patientId,
      encounterId,
      name: input.name ?? null,
      collectedAt: input.collectedAt,
      source: input.source,
      labName: input.labName ?? null,
      notes: input.notes ?? null,
    })
    .run();
  for (const row of rows) tx.insert(labValues).values(row).run();
  return panelId;
}

/**
 * Replace a panel's header and values. Old value rows are soft-deleted rather
 * than overwritten, so an edit never destroys what was there before.
 */
export async function updateLabPanel(panelId: string, input: Omit<LabPanelInput, 'patientId'>): Promise<void> {
  db.transaction((tx) => updateLabPanelInTransaction(tx, panelId, input, new Date()));
}

export function updateLabPanelInTransaction(
  tx: DbTransaction,
  panelId: string,
  input: Omit<LabPanelInput, 'patientId'>,
  now: Date,
): void {
  const panel = tx
    .select()
    .from(labPanels)
    .where(and(panelAlive, eq(labPanels.id, panelId)))
    .get();
  if (!panel) throw new Error('آزمایش در دسترس نیست؛ نوشته نگه داشته شد.');
  requirePatient(tx, panel.patientId);
  if (!Number.isFinite(input.collectedAt.getTime())) throw new Error('زمان نمونه‌گیری معتبر نیست.');
  const rows = valueRows(panelId, panel.patientId, input.values, now);
  tx.update(labPanels)
    .set({
      collectedAt: input.collectedAt,
      name: input.name ?? null,
      source: input.source,
      labName: input.labName ?? null,
      notes: input.notes ?? null,
      ...touch(now),
    })
    .where(and(panelAlive, eq(labPanels.id, panelId)))
    .run();
  tx.update(labValues)
    .set(softDelete(now))
    .where(and(eq(labValues.panelId, panelId), isNull(labValues.deletedAt)))
    .run();
  for (const row of rows) tx.insert(labValues).values(row).run();
}

export async function deleteLabPanel(panelId: string): Promise<void> {
  await db.update(labPanels).set(softDelete()).where(eq(labPanels.id, panelId));
}
