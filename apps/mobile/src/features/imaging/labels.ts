import type { ImagingStudy } from '@/db/schema';

export const MODALITY_LABELS: Record<ImagingStudy['modality'], string> = {
  xray: 'رادیوگرافی',
  ct: 'سی‌تی اسکن',
  mri: 'ام‌آر‌آی',
  us: 'سونوگرافی',
  echo: 'اکوکاردیوگرافی',
  endoscopy: 'اندوسکوپی',
  nuclear: 'اسکن هسته‌ای',
  angio: 'آنژیوگرافی',
  other: 'سایر',
};

export const IMAGING_STATUS_LABELS: Record<ImagingStudy['status'], string> = {
  ordered: 'درخواست‌شده',
  done: 'انجام‌شده',
  reported: 'گزارش آمده',
  reviewed: 'بررسی‌شده',
};
