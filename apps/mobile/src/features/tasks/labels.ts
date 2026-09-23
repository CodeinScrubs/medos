import type { Task } from '@/db/schema';

export const TASK_STATUS_LABEL: Record<Task['status'], string> = {
  open: 'باز',
  done: 'انجام‌شده',
  cancelled: 'لغوشده',
};

export const TASK_PRIORITY_OPTIONS = [
  { value: 'high', label: 'مهم' },
  { value: 'normal', label: 'معمولی' },
  { value: 'low', label: 'کم' },
] as const;
