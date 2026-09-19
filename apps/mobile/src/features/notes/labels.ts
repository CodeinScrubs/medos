import type { NoteType } from '@/db/schema';

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  admission: 'شرح حال',
  progress: 'پراگرس نوت',
  consult_request: 'درخواست کانسالت',
  consult_reply: 'پاسخ کانسالت',
  procedure: 'پروسیجر',
  operation: 'شرح عمل',
  outpatient_visit: 'ویزیت سرپایی',
  phone_followup: 'پیگیری تلفنی',
  discharge: 'خلاصه ترخیص',
  event: 'رویداد مهم',
  general: 'یادداشت',
};
