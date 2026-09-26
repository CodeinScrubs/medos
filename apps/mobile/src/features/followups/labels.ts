import type { FollowUp } from '@/db/schema';

export const FOLLOWUP_CHANNEL_LABELS: Record<FollowUp['channel'], string> = {
  call: 'تماس تلفنی',
  sms: 'پیامک',
  visit: 'ویزیت حضوری',
  message: 'پیام',
  lab: 'آزمایش',
  other: 'سایر',
};

/** Same order as a task's priority everywhere: most important first. */
export const FOLLOWUP_PRIORITY_LABELS: Record<FollowUp['priority'], string> = {
  high: 'مهم',
  normal: 'معمولی',
  low: 'کم',
};
