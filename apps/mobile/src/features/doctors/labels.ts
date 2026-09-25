import type { Doctor, Occasion } from '@/db/schema';

export const RELATIONSHIP_LABELS: Record<Doctor['relationship'], string> = {
  professor: 'استاد',
  attending: 'اتند',
  colleague: 'همکار',
  resident: 'رزیدنت',
  friend: 'دوست',
  referral: 'ارجاع',
  other: 'سایر',
};

/** The order the filter chips appear in — most-used first, not alphabetical. */
export const RELATIONSHIP_ORDER: Doctor['relationship'][] = [
  'professor',
  'attending',
  'colleague',
  'resident',
  'referral',
  'friend',
  'other',
];

export const OCCASION_KIND_LABELS: Record<Occasion['kind'], string> = {
  birthday: 'تولد',
  anniversary: 'سالگرد',
  graduation: 'فارغ‌التحصیلی',
  holiday: 'مناسبت تقویمی',
  religious: 'مناسبت مذهبی',
  custom: 'دلخواه',
};

/** What each 1–5 rating step means, so the numbers stay comparable over years. */
export const RATING_STEP_LABELS: Record<number, string> = {
  1: 'خیلی ضعیف',
  2: 'ضعیف',
  3: 'متوسط',
  4: 'خوب',
  5: 'عالی',
};
