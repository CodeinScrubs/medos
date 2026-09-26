import type { Diagnosis } from '@/db/schema';

export const DIAGNOSIS_KIND_LABELS: Record<Diagnosis['kind'], string> = {
  primary: 'اصلی',
  secondary: 'همراه',
  // Not «رد شود»: beside the status «رد شد» the two read as the same thing.
  rule_out: 'R/O',
  past: 'گذشته',
  complication: 'عارضه',
};

export const DIAGNOSIS_STATUS_LABELS: Record<Diagnosis['status'], string> = {
  active: 'فعال',
  resolved: 'برطرف شد',
  ruled_out: 'رد شد',
};
