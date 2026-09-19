import type { Encounter } from '@/db/schema';

export const ENCOUNTER_KIND_LABELS: Record<Encounter['kind'], string> = {
  admission: 'بستری',
  emergency: 'اورژانس',
  outpatient: 'سرپایی',
  consult_only: 'فقط کانسالت',
};

export const DISCHARGE_TYPE_LABELS: Record<NonNullable<Encounter['dischargeType']>, string> = {
  recovered: 'بهبودی',
  improved: 'بهبود نسبی',
  referred: 'اعزام / ارجاع',
  ama: 'ترخیص با رضایت شخصی',
  death: 'فوت',
  other: 'سایر',
};
