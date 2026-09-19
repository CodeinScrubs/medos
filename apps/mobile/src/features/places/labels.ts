import type { Place } from '@/db/schema';

export const PLACE_KIND_LABELS: Record<Place['kind'], string> = {
  hospital: 'بیمارستان',
  clinic: 'درمانگاه',
  office: 'مطب',
  lab: 'آزمایشگاه',
  imaging: 'تصویربرداری',
  pharmacy: 'داروخانه',
  university: 'دانشگاه',
  other: 'سایر',
};
