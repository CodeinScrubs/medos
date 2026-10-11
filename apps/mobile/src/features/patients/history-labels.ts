import type { ClinicalVersion } from '@/db/schema';
import { type ClinicalHistoryKind, type HistoryRow } from '@/lib/clinical-history';
import { formatJalali, formatJalaliDateTime } from '@/lib/jalali';

export const HISTORY_KIND_LABEL: Record<ClinicalHistoryKind, string> = {
  patient: 'پرونده',
  contact: 'همراه',
  encounter: 'نوبت درمانی',
  diagnosis: 'تشخیص',
  vital: 'علائم حیاتی',
  lab: 'آزمایش',
  imaging: 'تصویربرداری',
  order: 'کاردکس',
  consult: 'کانسالت',
  followup: 'پیگیری',
};
export const HISTORY_REASON_LABEL: Record<ClinicalVersion['reason'], string> = {
  created: 'اولین ثبت',
  edited: 'ویرایش',
  deleted: 'حذف',
  restored: 'بازیابی',
  baseline: 'وضعیت پیش از شروع تاریخچه',
  reconciled: 'اصلاح سازگاری داده‌ها',
};

const FIELD_LABEL: Record<string, string> = {
  firstName: 'نام',
  lastName: 'نام خانوادگی',
  nationalId: 'کد ملی',
  fileNumber: 'شماره پرونده',
  sex: 'جنس',
  birthDate: 'تاریخ تولد',
  ageYears: 'سن ثبت‌شده',
  phone: 'تلفن',
  city: 'شهر',
  address: 'آدرس',
  bloodType: 'گروه خونی',
  allergies: 'حساسیت‌ها',
  pastMedicalHistory: 'PMHx',
  drugHistory: 'داروهای قبلی',
  familyHistory: 'سابقه خانوادگی',
  habitualHistory: 'عادات',
  status: 'وضعیت',
  starred: 'نشان‌شده',
  tags: 'برچسب‌ها',
  summary: 'خلاصه',
  name: 'نام',
  relation: 'نسبت',
  isPrimary: 'تماس اصلی',
  notes: 'یادداشت',
  kind: 'نوع',
  ward: 'بخش',
  bed: 'تخت',
  service: 'سرویس',
  chiefComplaint: 'شکایت اصلی',
  admittedAt: 'پذیرش',
  admittedAtHasTime: 'ساعت پذیرش معلوم',
  dischargedAt: 'ترخیص',
  dischargeType: 'نوع ترخیص',
  outcomeNotes: 'توضیحات ترخیص',
  isActive: 'نوبت فعال',
  title: 'عنوان',
  icdCode: 'ICD',
  onsetDate: 'شروع بیماری',
  measuredAt: 'زمان اندازه‌گیری',
  systolic: 'SBP',
  diastolic: 'DBP',
  heartRate: 'HR',
  respRate: 'RR',
  temperature: 'Temperature',
  spo2: 'SpO2',
  bloodSugar: 'Blood sugar',
  bloodSugarUnit: 'واحد قند',
  weightKg: 'Weight (kg)',
  heightCm: 'Height (cm)',
  painScore: 'Pain score',
  urineOutput: 'Urine output',
  collectedAt: 'زمان نمونه‌گیری',
  source: 'منبع',
  labName: 'آزمایشگاه',
  analyte: 'Analyte',
  value: 'Value',
  unit: 'Unit',
  refLow: 'Reference low',
  refHigh: 'Reference high',
  flag: 'Flag',
  sortOrder: 'ترتیب',
  modality: 'Modality',
  region: 'Region',
  studyDate: 'زمان تصویربرداری',
  indication: 'Indication',
  report: 'Report',
  pacsUrl: 'لینک PACS',
  pacsLoginHint: 'راهنمای ورود PACS',
  brandName: 'Brand',
  dose: 'Dose',
  route: 'Route',
  frequency: 'Frequency',
  rate: 'Rate',
  duration: 'Duration',
  isPrn: 'PRN',
  prnCondition: 'شرط PRN',
  startAt: 'شروع',
  endAt: 'پایان',
  reason: 'دلیل',
  requestedAt: 'زمان درخواست',
  answeredAt: 'زمان پاسخ',
  respondedAt: 'زمان پاسخ',
  response: 'پاسخ',
  instruction: 'دستور پیگیری',
  dueAt: 'موعد',
  channel: 'روش تماس',
  priority: 'اولویت',
  completedAt: 'زمان پایان',
  outcome: 'نتیجه',
  deletedAt: 'زمان حذف',
  specialty: 'تخصص',
  followUpInstruction: 'دستور پیگیری',
  urgency: 'فوریت',
  storageLocation: 'محل نگهداری',
  storagePlatform: 'سامانه',
  accessionNumber: 'شماره پذیرش تصویربرداری',
  accessUrl: 'لینک دسترسی',
  accessNotes: 'راهنمای دسترسی',
  reportText: 'Report',
  impression: 'Impression',
  encounterId: 'نوبت مرتبط (شناسهٔ ثبت‌شده)',
  placeId: 'مرکز (شناسهٔ ثبت‌شده)',
  attendingId: 'اتند (شناسهٔ ثبت‌شده)',
  prescriberId: 'تجویزکننده (شناسهٔ ثبت‌شده)',
  doctorId: 'پزشک (شناسهٔ ثبت‌شده)',
  radiologistId: 'رادیولوژیست (شناسهٔ ثبت‌شده)',
  noteId: 'نوت مرتبط (شناسهٔ ثبت‌شده)',
};
const INTERNAL = new Set(['id', 'patientId', 'createdAt', 'updatedAt', 'searchText', 'panelId']);

/** Only presentation omits technical keys; the full immutable document stays available. */
export function historyFields(current: HistoryRow, previous?: HistoryRow) {
  const keys = [...new Set([...Object.keys(previous?.fields ?? {}), ...Object.keys(current.fields)])];
  return keys
    .filter(
      (key) =>
        !INTERNAL.has(key) &&
        (!previous
          ? current.fields[key] !== null && current.fields[key] !== ''
          : JSON.stringify(previous.fields[key]) !== JSON.stringify(current.fields[key]) ||
            previous.dates.includes(key) !== current.dates.includes(key)),
    )
    .map((key) => ({ key, label: FIELD_LABEL[key] ?? key }));
}

export function historyValue(row: HistoryRow, key: string): string {
  if (!(key in row.fields)) return 'ثبت نشده';
  const value = row.fields[key];
  if (value === null) return 'خالی';
  if (row.dates.includes(key) && typeof value === 'number') return formatJalaliDateTime(value);
  if (['birthDate', 'onsetDate'].includes(key) && typeof value === 'string') return formatJalali(value);
  if (typeof value === 'boolean') return value ? 'بله' : 'خیر';
  if (typeof value === 'string') return value === '' ? 'متن خالی' : value;
  return JSON.stringify(value);
}
