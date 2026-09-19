import type { FollowUp } from '@/db/schema';

export const FOLLOWUP_CHANNEL_LABELS: Record<FollowUp['channel'], string> = {
  call: 'تماس تلفنی',
  sms: 'پیامک',
  visit: 'ویزیت حضوری',
  message: 'پیام',
  lab: 'آزمایش',
  other: 'سایر',
};

export const FOLLOWUP_PRIORITY_LABELS: Record<FollowUp['priority'], string> = {
  low: 'کم',
  normal: 'معمولی',
  high: 'مهم',
};
