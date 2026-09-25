import { parseDecimal } from '@/lib/persian';

/*
 * Reading and writing observations the way they are actually said.
 *
 * MedOS records, it does not advise. Nothing here knows that a systolic of 70
 * is low or a temperature of 39 is a fever: no colour, no flag, no range. A
 * number the app decided to call abnormal is the app having an opinion about a
 * patient it has never seen, and the person reading it already knows.
 */

export type BloodPressure = { systolic: number | null; diastolic: number | null };

/**
 * "120/80", with any digits and any of the slashes a phone keyboard produces.
 *
 * Blood pressure is written as one thing and should be typed as one thing.
 * Two boxes side by side is two chances to put a number in the wrong one.
 */
export function parseBloodPressure(input: string | null | undefined): BloodPressure | null {
  if (!input) return null;
  // The Arabic decimal separator is not a blood-pressure separator.
  const parts = input.split(/[/\\÷|⁄]/);
  if (parts.length !== 2) return null;
  const [left, right] = parts.map((p) => p.trim()) as [string, string];
  const systolic = parseDecimal(left);
  const diastolic = parseDecimal(right);
  if ((!left && !right) || (left && systolic == null) || (right && diastolic == null)) return null;
  if (systolic != null && (!Number.isInteger(systolic) || systolic <= 0)) return null;
  if (diastolic != null && (!Number.isInteger(diastolic) || diastolic <= 0)) return null;
  return { systolic, diastolic };
}

/** What goes back in the box when an existing reading is edited. */
export function formatBloodPressureInput(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
): string {
  if (systolic == null && diastolic == null) return '';
  return `${systolic ?? ''}/${diastolic ?? ''}`;
}

export type VitalFields = {
  systolic: number | null;
  diastolic: number | null;
  heartRate: number | null;
  respRate: number | null;
  temperature: number | null;
  spo2: number | null;
  bloodSugar: number | null;
  weightKg: number | null;
  heightCm: number | null;
  painScore: number | null;
};

export const VITAL_NUMBER_KEYS = [
  'heartRate',
  'respRate',
  'temperature',
  'spo2',
  'bloodSugar',
  'weightKg',
  'heightCm',
  'painScore',
] as const;
type VitalNumberKey = (typeof VITAL_NUMBER_KEYS)[number];
export type VitalForm = Record<VitalNumberKey | 'bp' | 'urineOutput' | 'notes', string>;

/** Reject nonempty invalid input as a whole; it must never become a blank measurement. */
export function parseVitalForm(
  form: VitalForm,
):
  | { ok: true; values: VitalFields & { urineOutput: string | null; notes: string | null } }
  | { ok: false; errors: Partial<Record<keyof VitalForm, string>> } {
  const errors: Partial<Record<keyof VitalForm, string>> = {};
  const bp = parseBloodPressure(form.bp);
  if (form.bp.trim() && !bp) errors.bp = 'مثلاً 120/80؛ اگر یک مقدار نامعلوم است جای آن را خالی بگذارید.';
  const values: VitalFields = {
    systolic: bp?.systolic ?? null,
    diastolic: bp?.diastolic ?? null,
    heartRate: null,
    respRate: null,
    temperature: null,
    spo2: null,
    bloodSugar: null,
    weightKg: null,
    heightCm: null,
    painScore: null,
  };
  for (const key of VITAL_NUMBER_KEYS) {
    values[key] = parseDecimal(form[key]);
    if (form[key].trim() && values[key] == null) errors[key] = 'عدد خوانده نشد؛ اعشار را با نقطه بنویسید.';
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    values: { ...values, urineOutput: form.urineOutput.trim() || null, notes: form.notes.trim() || null },
  };
}

/** Storage validation, not a normal/abnormal clinical range. */
export function validateVitalNumbers(values: Partial<VitalFields>): void {
  for (const key of ['systolic', 'diastolic', ...VITAL_NUMBER_KEYS] as const) {
    const value = values[key];
    if (value != null && !Number.isFinite(value)) throw new Error(`Invalid numeric field: ${key}`);
  }
}

/** Did anything at all get measured? An empty set of vitals is not a reading. */
export function hasAnyVital(v: Partial<VitalFields> & { urineOutput?: string | null }): boolean {
  const numbers: (number | null | undefined)[] = [
    v.systolic,
    v.diastolic,
    v.heartRate,
    v.respRate,
    v.temperature,
    v.spo2,
    v.bloodSugar,
    v.weightKg,
    v.heightCm,
    v.painScore,
  ];
  if (numbers.some((n) => n != null)) return true;
  return Boolean(v.urineOutput?.trim());
}

export type VitalChip = { key: string; label: string; value: string };

/**
 * One reading as a handful of labelled values, in the order a chart is read.
 *
 * Only what was measured: a row of dashes where nothing was taken says the
 * observation was missed, which is a different claim from not having taken it.
 *
 * The numbers stay Latin. They are clinical values that get compared, copied
 * and read aloud, and switching digit systems between the record and the
 * device's keyboard is how a 5 becomes a 6.
 */
export function vitalChips(v: Partial<VitalFields> & { urineOutput?: string | null }): VitalChip[] {
  const chips: VitalChip[] = [];
  const push = (key: string, label: string, value: number | string | null | undefined, unit = '') => {
    if (value == null || value === '') return;
    chips.push({ key, label, value: `${value}${unit}` });
  };

  if (v.systolic != null && v.diastolic != null) {
    chips.push({ key: 'bp', label: 'فشار', value: `${v.systolic}/${v.diastolic}` });
  } else {
    push('systolic', 'فشار سیستول', v.systolic);
    push('diastolic', 'فشار دیاستول', v.diastolic);
  }
  push('hr', 'نبض', v.heartRate);
  push('rr', 'تنفس', v.respRate);
  push('t', 'دما', v.temperature, '°');
  push('spo2', 'اشباع', v.spo2, '%');
  push('bs', 'قند', v.bloodSugar);
  push('wt', 'وزن', v.weightKg, ' kg');
  push('ht', 'قد', v.heightCm, ' cm');
  push('pain', 'درد', v.painScore);
  push('uo', 'ادرار', v.urineOutput?.trim() || null);
  return chips;
}
