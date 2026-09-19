/**
 * Lab panel presets: which analytes to lay out for fast entry, in the order
 * they appear on a typical Iranian lab sheet, with conventional units.
 *
 * REFERENCE RANGES — read before editing.
 *
 * A prefilled range is only a typing shortcut, but it drives the H/L flag, and
 * a wrong flag is worse than no flag. So a range is included only where adult
 * ranges are stable across labs and methods. Method-dependent analytes (ALP,
 * AST, ALT, LDH, CPK, PT, PTT, ESR, CRP, ferritin, TSH, troponin...) are left
 * blank on purpose: many Iranian labs report ALP with an upper limit near 300
 * U/L, and a textbook default of 130 would flag every normal result. The user
 * types those ranges from their own lab's sheet.
 *
 * Ranges are adult-only. `rangesFor()` returns nothing for patients under 18
 * or of unknown age, because paediatric norms differ enough (WBC, Hb, ALP,
 * creatinine) that an adult range would mislead.
 */

export type RefRange = { low: number | null; high: number | null };

export type AnalyteDef = {
  analyte: string;
  unit?: string;
  /** Sex-independent adult range. */
  ref?: RefRange;
  /** Sex-specific adult ranges; take precedence over `ref`. */
  refMale?: RefRange;
  refFemale?: RefRange;
  /** Qualitative results (UA dipstick) are text, never flagged numerically. */
  qualitative?: boolean;
};

export type PanelPreset = {
  key: string;
  label: string;
  analytes: AnalyteDef[];
};

const r = (low: number | null, high: number | null): RefRange => ({ low, high });

export const LAB_PRESETS: PanelPreset[] = [
  {
    key: 'cbc',
    label: 'CBC',
    analytes: [
      { analyte: 'WBC', unit: '×10³/µL', ref: r(4, 10) },
      { analyte: 'RBC', unit: '×10⁶/µL', refMale: r(4.5, 5.9), refFemale: r(4.0, 5.2) },
      { analyte: 'Hb', unit: 'g/dL', refMale: r(13.5, 17.5), refFemale: r(12, 15.5) },
      { analyte: 'Hct', unit: '%', refMale: r(41, 53), refFemale: r(36, 46) },
      { analyte: 'MCV', unit: 'fL', ref: r(80, 100) },
      { analyte: 'MCH', unit: 'pg', ref: r(27, 33) },
      { analyte: 'MCHC', unit: 'g/dL', ref: r(32, 36) },
      { analyte: 'Plt', unit: '×10³/µL', ref: r(150, 450) },
      { analyte: 'Neut', unit: '%' },
      { analyte: 'Lymph', unit: '%' },
    ],
  },
  {
    key: 'chem',
    label: 'بیوشیمی',
    analytes: [
      { analyte: 'FBS', unit: 'mg/dL', ref: r(70, 100) },
      { analyte: 'BS', unit: 'mg/dL' },
      { analyte: 'Urea', unit: 'mg/dL', ref: r(15, 45) },
      { analyte: 'BUN', unit: 'mg/dL', ref: r(7, 20) },
      { analyte: 'Cr', unit: 'mg/dL', refMale: r(0.7, 1.3), refFemale: r(0.6, 1.1) },
      { analyte: 'Na', unit: 'mEq/L', ref: r(135, 145) },
      { analyte: 'K', unit: 'mEq/L', ref: r(3.5, 5.1) },
      { analyte: 'Ca', unit: 'mg/dL', ref: r(8.5, 10.5) },
      { analyte: 'P', unit: 'mg/dL', ref: r(2.5, 4.5) },
      { analyte: 'Mg', unit: 'mg/dL' },
      { analyte: 'Uric acid', unit: 'mg/dL' },
    ],
  },
  {
    key: 'lft',
    label: 'LFT',
    analytes: [
      { analyte: 'AST', unit: 'U/L' },
      { analyte: 'ALT', unit: 'U/L' },
      { analyte: 'ALP', unit: 'U/L' },
      { analyte: 'Bili T', unit: 'mg/dL', ref: r(0.3, 1.2) },
      { analyte: 'Bili D', unit: 'mg/dL', ref: r(0, 0.3) },
      { analyte: 'Albumin', unit: 'g/dL', ref: r(3.5, 5) },
      { analyte: 'Total protein', unit: 'g/dL', ref: r(6, 8.3) },
    ],
  },
  {
    key: 'coag',
    label: 'انعقادی',
    analytes: [
      { analyte: 'PT', unit: 'sec' },
      { analyte: 'INR', ref: r(0.8, 1.2) },
      { analyte: 'PTT', unit: 'sec' },
    ],
  },
  {
    key: 'abg',
    label: 'ABG / VBG',
    analytes: [
      { analyte: 'pH', ref: r(7.35, 7.45) },
      { analyte: 'pCO2', unit: 'mmHg', ref: r(35, 45) },
      { analyte: 'pO2', unit: 'mmHg' },
      { analyte: 'HCO3', unit: 'mEq/L', ref: r(22, 26) },
      { analyte: 'BE', unit: 'mEq/L' },
      { analyte: 'SaO2', unit: '%' },
      { analyte: 'Lactate', unit: 'mmol/L' },
    ],
  },
  {
    key: 'ua',
    label: 'U/A',
    analytes: [
      { analyte: 'SG' },
      { analyte: 'Urine pH' },
      { analyte: 'Protein', qualitative: true },
      { analyte: 'Glucose (U)', qualitative: true },
      { analyte: 'Ketone', qualitative: true },
      { analyte: 'Blood (U)', qualitative: true },
      { analyte: 'Nitrite', qualitative: true },
      { analyte: 'Leukocyte esterase', qualitative: true },
      { analyte: 'WBC (U)', unit: '/hpf', qualitative: true },
      { analyte: 'RBC (U)', unit: '/hpf', qualitative: true },
      { analyte: 'Bacteria', qualitative: true },
    ],
  },
  {
    key: 'inflam',
    label: 'التهابی',
    analytes: [
      { analyte: 'ESR', unit: 'mm/h' },
      { analyte: 'CRP', unit: 'mg/L' },
      { analyte: 'Procalcitonin', unit: 'ng/mL' },
    ],
  },
  {
    key: 'cardiac',
    label: 'قلبی',
    analytes: [
      { analyte: 'Troponin', unit: 'ng/mL' },
      { analyte: 'CK-MB', unit: 'U/L' },
      { analyte: 'CPK', unit: 'U/L' },
      { analyte: 'LDH', unit: 'U/L' },
      { analyte: 'NT-proBNP', unit: 'pg/mL' },
    ],
  },
  {
    key: 'lipid',
    label: 'چربی',
    analytes: [
      { analyte: 'Chol', unit: 'mg/dL' },
      { analyte: 'TG', unit: 'mg/dL' },
      { analyte: 'HDL', unit: 'mg/dL' },
      { analyte: 'LDL', unit: 'mg/dL' },
    ],
  },
  {
    key: 'thyroid',
    label: 'تیروئید',
    analytes: [
      { analyte: 'TSH', unit: 'mIU/L' },
      { analyte: 'T4', unit: 'µg/dL' },
      { analyte: 'T3', unit: 'ng/dL' },
      { analyte: 'FT4', unit: 'ng/dL' },
    ],
  },
  {
    key: 'iron',
    label: 'آهن',
    analytes: [
      { analyte: 'Fe', unit: 'µg/dL' },
      { analyte: 'TIBC', unit: 'µg/dL' },
      { analyte: 'Ferritin', unit: 'ng/mL' },
    ],
  },
  {
    key: 'misc',
    label: 'سایر',
    analytes: [
      { analyte: 'HbA1c', unit: '%', ref: r(4, 5.6) },
      { analyte: 'Amylase', unit: 'U/L' },
      { analyte: 'Lipase', unit: 'U/L' },
      { analyte: 'Vit D', unit: 'ng/mL' },
      { analyte: 'Vit B12', unit: 'pg/mL' },
    ],
  },
];

/** Canonical row order for the flowsheet: preset order first, then anything custom. */
export const ANALYTE_ORDER: Map<string, number> = new Map(
  LAB_PRESETS.flatMap((p) => p.analytes.map((a) => a.analyte)).map((name, i) => [name.toLowerCase(), i]),
);

const DEF_BY_NAME: Map<string, AnalyteDef> = new Map(
  LAB_PRESETS.flatMap((p) => p.analytes).map((a) => [a.analyte.toLowerCase(), a]),
);

export function analyteDef(name: string): AnalyteDef | undefined {
  return DEF_BY_NAME.get(name.trim().toLowerCase());
}

/**
 * The prefilled range for this patient, or nothing. See the note at the top of
 * this file for why children and unknown ages get no default.
 */
export function rangeFor(
  def: AnalyteDef | undefined,
  patient: { sex: 'male' | 'female' | 'other' | null; ageYears: number | null },
): RefRange | null {
  if (!def || def.qualitative) return null;
  if (patient.ageYears == null || patient.ageYears < 18) return null;
  if (patient.sex === 'male' && def.refMale) return def.refMale;
  if (patient.sex === 'female' && def.refFemale) return def.refFemale;
  if (def.refMale || def.refFemale) return null; // sex-specific but sex unknown
  return def.ref ?? null;
}
