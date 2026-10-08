/** Recorded units only. This module does not convert or interpret a glucose value. */
export const BLOOD_SUGAR_UNITS = ['mg/dL', 'mmol/L'] as const;
export type BloodSugarUnit = (typeof BLOOD_SUGAR_UNITS)[number];
export const isBloodSugarUnit = (value: unknown): value is BloodSugarUnit => value === 'mg/dL' || value === 'mmol/L';
