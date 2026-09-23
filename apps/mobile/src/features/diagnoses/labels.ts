import type { Diagnosis } from '@/db/schema';

export const DIAGNOSIS_KIND_LABELS: Record<Diagnosis['kind'], string> = {
  primary: 'اصلی',
  secondary: 'همراه',
  rule_out: 'رد شود',
  past: 'گذشته',
  complication: 'عارضه',
};

export const DIAGNOSIS_STATUS_LABELS: Record<Diagnosis['status'], string> = {
  active: 'فعال',
  resolved: 'برطرف شد',
  ruled_out: 'رد شد',
};
