import type { Order } from '@/db/schema';

export const ORDER_KIND_LABELS: Record<Order['kind'], string> = {
  drug: 'دارو',
  fluid: 'سرم',
  diet: 'رژیم',
  nursing: 'دستور پرستاری',
  lab: 'آزمایش',
  imaging: 'تصویربرداری',
  consult: 'کانسالت',
  other: 'سایر',
};

export const ORDER_STATUS_LABELS: Record<Order['status'], string> = {
  active: 'فعال',
  held: 'متوقف موقت',
  discontinued: 'قطع‌شده',
  completed: 'تمام‌شده',
};

/** Common routes, in the order they are actually written on a kardex. */
export const ROUTES = ['PO', 'IV', 'IM', 'SC', 'SL', 'PR', 'INH', 'TOP', 'OPH', 'NG', 'ID'] as const;

/** Frequency shorthand as written in Iranian hospitals. */
export const FREQUENCIES = [
  'STAT',
  'Daily',
  'BD',
  'TDS',
  'QID',
  'Q6H',
  'Q8H',
  'Q12H',
  'HS',
  'AC',
  'PC',
  'PRN',
  'Q48H',
  'Weekly',
] as const;
