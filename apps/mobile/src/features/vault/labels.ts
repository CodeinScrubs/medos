import type { Credential } from '@/db/schema';

export const CREDENTIAL_CATEGORY_LABELS: Record<Credential['category'], string> = {
  prescription: 'سامانه‌ی نسخه',
  insurance: 'بیمه',
  hospital: 'بیمارستان',
  university: 'دانشگاه',
  lab: 'آزمایشگاه',
  personal: 'شخصی',
  other: 'سایر',
};

export const CREDENTIAL_OWNER_LABELS: Record<Credential['ownerKind'], string> = {
  self: 'خودم',
  colleague: 'همکار',
  shared: 'مشترک',
};
