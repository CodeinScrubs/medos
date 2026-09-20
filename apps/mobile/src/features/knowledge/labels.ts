import type { Idea, PrescriptionTemplate } from '@/db/schema';

export const IDEA_KIND_LABELS: Record<Idea['kind'], string> = {
  feature: 'قابلیت',
  bug: 'ایراد',
  workflow: 'روش کار',
  research: 'تحقیق',
  personal: 'شخصی',
  other: 'سایر',
};

export const IDEA_STATUS_LABELS: Record<Idea['status'], string> = {
  inbox: 'تازه',
  planned: 'برنامه‌ریزی‌شده',
  doing: 'در حال انجام',
  done: 'انجام شد',
  dropped: 'کنار گذاشته شد',
};

/** The order a board shows them in: what is moving first, what is finished last. */
export const IDEA_STATUS_ORDER: Idea['status'][] = ['doing', 'planned', 'inbox', 'done', 'dropped'];

export const IDEA_PRIORITY_LABELS: Record<Idea['priority'], string> = {
  low: 'کم',
  normal: 'معمولی',
  high: 'مهم',
};

export const AGE_GROUP_LABELS: Record<PrescriptionTemplate['ageGroup'], string> = {
  any: 'همه',
  adult: 'بزرگسال',
  pediatric: 'کودکان',
  geriatric: 'سالمند',
};

/** Where a subject was taught — offered as chips, but the field takes anything. */
export const COMMON_CONTEXTS = ['راند', 'کلاس', 'ژورنال کلاب', 'کنفرانس', 'مطالعه‌ی شخصی', 'درمانگاه', 'اورژانس'];
