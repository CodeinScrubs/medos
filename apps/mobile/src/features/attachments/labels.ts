import type { AttachmentKind } from '@/db/schema';

export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  photo: 'عکس',
  clinical_photo: 'عکس بالینی',
  lab_sheet: 'برگه آزمایش',
  radiology: 'رادیولوژی',
  document: 'سند',
  voice: 'وویس',
  video: 'ویدیو',
  other: 'سایر',
};
