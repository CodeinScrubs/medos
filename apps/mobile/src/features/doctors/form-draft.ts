import { z } from 'zod';

import type { Doctor, DoctorProfile } from '@/db/schema';
import { dateInputText, validateDateInput } from '@/lib/date-input';
import { fromIsoDate } from '@/lib/jalali';

import { changedFormPatch, DoctorFormConflict } from './edit-basis';

const relationship = z.enum(['professor', 'attending', 'colleague', 'resident', 'friend', 'referral', 'other']);
const directoryFields = z
  .object({
    title: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    academicRank: z.string(),
    relationship,
    specialtyId: z.string().nullable(),
    subspecialtyId: z.string().nullable(),
    specialtyText: z.string(),
    phone: z.string(),
    phoneAlt: z.string(),
    whatsapp: z.string(),
    telegram: z.string(),
    email: z.string(),
    extension: z.string(),
    primaryPlaceId: z.string().nullable(),
    officeAddress: z.string(),
    officeHours: z.string(),
    officePhone: z.string(),
    acceptsReferrals: z.boolean(),
    visitFee: z.string(),
    insurances: z.string(),
    referralNotes: z.string(),
    tags: z.string(),
    notes: z.string(),
    starred: z.boolean(),
  })
  .strict();
const directoryValues = directoryFields.extend({
  title: z.string().nullable(),
  academicRank: z.string().nullable(),
  specialtyText: z.string().nullable(),
  phone: z.string().nullable(),
  phoneAlt: z.string().nullable(),
  whatsapp: z.string().nullable(),
  telegram: z.string().nullable(),
  email: z.string().nullable(),
  extension: z.string().nullable(),
  officeAddress: z.string().nullable(),
  officeHours: z.string().nullable(),
  officePhone: z.string().nullable(),
  acceptsReferrals: z.boolean().nullable(),
  visitFee: z.string().nullable(),
  insurances: z.array(z.string()).nullable(),
  referralNotes: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  notes: z.string().nullable(),
});
const profileFields = z
  .object({
    birthDate: z.string(),
    hometown: z.string(),
    almaMater: z.string(),
    graduationYear: z.string(),
    familyNotes: z.string(),
    interests: z.string(),
    favoriteTopics: z.string(),
    dislikes: z.string(),
    howWeMet: z.string(),
    memorableMoments: z.string(),
    communicationStyle: z.string(),
    personalNotes: z.string(),
  })
  .strict();
const profileValues = profileFields.extend({
  birthDate: z.string().nullable(),
  hometown: z.string().nullable(),
  almaMater: z.string().nullable(),
  graduationYear: z.string().nullable(),
  familyNotes: z.string().nullable(),
  interests: z.array(z.string()).nullable(),
  favoriteTopics: z.string().nullable(),
  dislikes: z.string().nullable(),
  howWeMet: z.string().nullable(),
  memorableMoments: z.string().nullable(),
  communicationStyle: z.string().nullable(),
  personalNotes: z.string().nullable(),
});
const score = z.number().int().min(1).max(5).nullable().optional();
const ratingFields = z
  .object({
    scores: z
      .object({
        knowledge: score,
        orientation: score,
        patientRapport: score,
        emergencyResponsiveness: score,
        contactOpenness: score,
        teaching: score,
      })
      .strict(),
    reasoning: z.string(),
  })
  .strict();
const directory = z
  .object({
    version: z.literal(1),
    kind: z.literal('directory'),
    fields: directoryFields,
    base: z.object({ id: z.string(), values: directoryValues }).strict().nullable(),
  })
  .strict();
const profile = z
  .object({
    version: z.literal(1),
    kind: z.literal('profile'),
    fields: profileFields,
    base: z.object({ id: z.string(), values: profileValues }).strict().nullable(),
  })
  .strict();
const rating = z
  .object({ version: z.literal(1), kind: z.literal('rating'), fields: ratingFields, base: z.null() })
  .strict();
const schema = z.discriminatedUnion('kind', [directory, profile, rating]);
export type DoctorFormDocument = z.infer<typeof schema>;
export type DoctorFormKind = DoctorFormDocument['kind'];
export type DoctorFormDocumentFor<K extends DoctorFormKind> = Extract<DoctorFormDocument, { kind: K }>;
export type DoctorFormFieldsFor<K extends DoctorFormKind> = DoctorFormDocumentFor<K>['fields'];

export function decodeDoctorForm(body: string): DoctorFormDocument {
  try {
    return schema.parse(JSON.parse(body));
  } catch {
    throw new Error('پیش‌نویس پزشک قابل خواندن نیست؛ اطلاعات ذخیره‌شده تغییر نکرد.');
  }
}
export function encodeDoctorForm(document: DoctorFormDocument): string {
  return JSON.stringify(schema.parse(document));
}
const list = (text: string) =>
  text
    .split(/[,،]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Store only editable fields; timestamps, search and unrelated coordinates are not an edit's basis. */
export function directoryFormBase(doctor: Doctor) {
  const values = Object.fromEntries(
    Object.keys(directoryValues.shape).map((key) => [key, doctor[key as keyof Doctor]]),
  );
  return { id: doctor.id, values: directoryValues.parse(values) };
}
export function profileFormBase(profile: DoctorProfile) {
  const values = Object.fromEntries(
    Object.keys(profileValues.shape).map((key) => [key, profile[key as keyof DoctorProfile]]),
  );
  return { id: profile.id, values: profileValues.parse(values) };
}
export function initialDirectoryFields(
  doctor?: z.infer<typeof directoryValues> | null,
): z.infer<typeof directoryFields> {
  return {
    title: doctor?.title ?? 'دکتر',
    firstName: doctor?.firstName ?? '',
    lastName: doctor?.lastName ?? '',
    academicRank: doctor?.academicRank ?? '',
    relationship: doctor?.relationship ?? 'colleague',
    specialtyId: doctor?.specialtyId ?? null,
    subspecialtyId: doctor?.subspecialtyId ?? null,
    specialtyText: doctor?.specialtyText ?? '',
    phone: doctor?.phone ?? '',
    phoneAlt: doctor?.phoneAlt ?? '',
    whatsapp: doctor?.whatsapp ?? '',
    telegram: doctor?.telegram ?? '',
    email: doctor?.email ?? '',
    extension: doctor?.extension ?? '',
    primaryPlaceId: doctor?.primaryPlaceId ?? null,
    officeAddress: doctor?.officeAddress ?? '',
    officeHours: doctor?.officeHours ?? '',
    officePhone: doctor?.officePhone ?? '',
    acceptsReferrals: doctor?.acceptsReferrals ?? false,
    visitFee: doctor?.visitFee ?? '',
    insurances: (doctor?.insurances ?? []).join('، '),
    referralNotes: doctor?.referralNotes ?? '',
    tags: (doctor?.tags ?? []).join('، '),
    notes: doctor?.notes ?? '',
    starred: doctor?.starred ?? false,
  };
}
export function initialProfileFields(profile?: z.infer<typeof profileValues> | null): z.infer<typeof profileFields> {
  const birth = fromIsoDate(profile?.birthDate);
  return {
    birthDate: birth ? dateInputText(birth) : (profile?.birthDate ?? ''),
    hometown: profile?.hometown ?? '',
    almaMater: profile?.almaMater ?? '',
    graduationYear: profile?.graduationYear ?? '',
    familyNotes: profile?.familyNotes ?? '',
    interests: (profile?.interests ?? []).join('، '),
    favoriteTopics: profile?.favoriteTopics ?? '',
    dislikes: profile?.dislikes ?? '',
    howWeMet: profile?.howWeMet ?? '',
    memorableMoments: profile?.memorableMoments ?? '',
    communicationStyle: profile?.communicationStyle ?? '',
    personalNotes: profile?.personalNotes ?? '',
  };
}
export function initialDoctorForm<K extends DoctorFormKind>(
  kind: K,
  doctor: Doctor | null,
  savedProfile: DoctorProfile | null,
): DoctorFormDocumentFor<K> {
  const document: DoctorFormDocument =
    kind === 'directory'
      ? { version: 1, kind, fields: initialDirectoryFields(doctor), base: doctor ? directoryFormBase(doctor) : null }
      : kind === 'profile'
        ? {
            version: 1,
            kind,
            fields: initialProfileFields(savedProfile),
            base: savedProfile ? profileFormBase(savedProfile) : null,
          }
        : { version: 1, kind: 'rating', fields: { scores: {}, reasoning: '' }, base: null };
  return document as DoctorFormDocumentFor<K>;
}
export function directoryFormValues(document: DoctorFormDocumentFor<'directory'>, describedSpecialty = '') {
  const f = directory.parse(document).fields;
  if (!f.firstName.trim() || !f.lastName.trim()) throw new Error('نام و نام خانوادگی لازم است؛ پیش‌نویس نگه داشته شد.');
  return {
    ...f,
    title: f.title.trim() || null,
    firstName: f.firstName.trim(),
    lastName: f.lastName.trim(),
    academicRank: f.academicRank.trim() || null,
    specialtyText: f.specialtyText.trim() || describedSpecialty || null,
    phone: f.phone.trim() || null,
    phoneAlt: f.phoneAlt.trim() || null,
    whatsapp: f.whatsapp.trim() || null,
    telegram: f.telegram.trim() || null,
    email: f.email.trim() || null,
    extension: f.extension.trim() || null,
    officeAddress: f.officeAddress.trim() || null,
    officeHours: f.officeHours.trim() || null,
    officePhone: f.officePhone.trim() || null,
    visitFee: f.visitFee.trim() || null,
    insurances: list(f.insurances),
    referralNotes: f.referralNotes.trim() || null,
    tags: list(f.tags),
    notes: f.notes.trim() || null,
  };
}
export function profileFormValues(document: DoctorFormDocumentFor<'profile'>, now: Date) {
  const f = profile.parse(document).fields;
  const birth = validateDateInput(f.birthDate, { now, required: false, allowFuture: false });
  if (!birth.valid) throw new Error('تاریخ تولد معتبر نیست؛ پیش‌نویس نگه داشته شد.');
  return {
    birthDate: birth.iso,
    hometown: f.hometown.trim() || null,
    almaMater: f.almaMater.trim() || null,
    graduationYear: f.graduationYear.trim() || null,
    familyNotes: f.familyNotes.trim() || null,
    interests: list(f.interests),
    favoriteTopics: f.favoriteTopics.trim() || null,
    dislikes: f.dislikes.trim() || null,
    howWeMet: f.howWeMet.trim() || null,
    memorableMoments: f.memorableMoments.trim() || null,
    communicationStyle: f.communicationStyle.trim() || null,
    personalNotes: f.personalNotes.trim() || null,
  };
}
export function ratingFormValues(document: DoctorFormDocumentFor<'rating'>) {
  const f = rating.parse(document).fields;
  if (Object.values(f.scores).every((s) => s == null) && !f.reasoning.trim())
    throw new Error('حداقل یک معیار یا دلیل لازم است؛ پیش‌نویس نگه داشته شد.');
  return { ...f.scores, reasoning: f.reasoning };
}

export function directoryFormPatch(document: DoctorFormDocumentFor<'directory'>, describedSpecialty = '') {
  const values = directoryFormValues(document, describedSpecialty);
  return document.base
    ? changedFormPatch(initialDirectoryFields(document.base.values), document.fields, values)
    : values;
}
export function profileFormPatch(document: DoctorFormDocumentFor<'profile'>, now: Date) {
  return changedFormPatch(
    initialProfileFields(document.base?.values),
    document.fields,
    profileFormValues(document, now),
  );
}
/** Explicit resolution rebases changed fields only; unrelated live values remain intact. */
export function rebaseDoctorForm(
  document: DoctorFormDocument,
  doctor: Doctor | null,
  savedProfile: DoctorProfile | null,
): DoctorFormDocument {
  if (document.kind === 'rating') return document;
  if (!doctor || doctor.deletedAt) throw new DoctorFormConflict();
  if (document.kind === 'directory') {
    if (document.base && document.base.id !== doctor.id) throw new DoctorFormConflict();
    const initial = initialDirectoryFields(document.base?.values);
    const patch = changedFormPatch(initial, document.fields, document.fields);
    if (['specialtyId', 'subspecialtyId', 'specialtyText'].some((k) => k in patch))
      Object.assign(patch, {
        specialtyId: document.fields.specialtyId,
        subspecialtyId: document.fields.subspecialtyId,
        specialtyText: document.fields.specialtyText,
      });
    return { ...document, base: directoryFormBase(doctor), fields: { ...initialDirectoryFields(doctor), ...patch } };
  }
  if (document.base && (!savedProfile || savedProfile.id !== document.base.id)) throw new DoctorFormConflict();
  const patch = changedFormPatch(initialProfileFields(document.base?.values), document.fields, document.fields);
  return {
    ...document,
    base: savedProfile ? profileFormBase(savedProfile) : null,
    fields: { ...initialProfileFields(savedProfile), ...patch },
  };
}
