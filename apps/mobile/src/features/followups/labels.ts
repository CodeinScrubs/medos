import type { FollowUp } from '@/db/schema';

export const FOLLOWUP_CHANNEL_LABELS: Record<FollowUp['channel'], string> = {
  call: 'تماس تلفنی',
  sms: 'پیامک',
  visit: 'ویزیت حضوری',
  message: 'پیام',
  lab: 'پیگیری نتیجه',
  other: 'سایر',
};

export function resultStageLabel(stage: string | null): string {
  switch (stage) {
    case 'received':
      return 'نتیجه دریافت شد';
    case 'reviewed':
      return 'نتیجه مرور شد';
    case 'actionTaken':
      return 'اقدام انجام شد';
    case 'noActionNeeded':
      return 'اقدامی لازم نبود';
    case null:
    case 'waiting':
      return 'در انتظار نتیجه';
    default:
      return 'مرحله نامعتبر';
  }
}

/** Same order as a task's priority everywhere: most important first. */
export const FOLLOWUP_PRIORITY_LABELS: Record<FollowUp['priority'], string> = {
  high: 'مهم',
  normal: 'معمولی',
  low: 'کم',
};
