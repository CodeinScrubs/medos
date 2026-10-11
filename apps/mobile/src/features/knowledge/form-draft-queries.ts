import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  ideas,
  prescriptionTemplates,
  specialties,
  specialtyProfiles,
  topics,
  workspaceFormDrafts,
  type Idea,
  type PrescriptionTemplate,
  type SpecialtyProfile,
  type Topic,
} from '@/db/schema';
import { openFormScope } from '@/features/workspace-forms/queries';
import type { FormPort } from '@/features/workspace-forms/types';
import { formScope } from '@/lib/form-document';

import {
  ideaFormCodec,
  initialIdeaFields,
  initialTopicFields,
  initialPrescriptionFields,
  initialSpecialtyProfileFields,
  prescriptionFormCodec,
  prescriptionFormInput,
  specialtyProfileFormCodec,
  specialtyProfileFormInput,
  topicFormCodec,
  topicFormInput,
  type IdeaFormFields,
  type TopicFormFields,
  type PrescriptionFormFields,
  type SpecialtyProfileFormFields,
} from './form-draft';
import { createIdeaInTransaction, updateIdeaInTransaction } from './ideas-queries';
import { IDEA_KIND_LABELS, IDEA_PRIORITY_LABELS, IDEA_STATUS_LABELS } from './labels';
import { createPrescriptionInTransaction, updatePrescriptionInTransaction } from './prescriptions-queries';
import { createTopicInTransaction, updateTopicInTransaction } from './queries';
import { createSpecialtyProfileInTransaction, updateSpecialtyProfileInTransaction } from './specialty-profiles-queries';

export function ideaFormQuery(recordId: string | null, draftId: string | null = null) {
  return db
    .select({ scope: sql<string>`${formScope(recordId)}`, record: ideas, draft: workspaceFormDrafts })
    .from(sql`(select 1) as workspace_seed`)
    .leftJoin(ideas, recordId === null ? sql`0` : eq(ideas.id, recordId))
    .leftJoin(
      workspaceFormDrafts,
      draftId === null
        ? openFormScope('idea', recordId)
        : and(
            eq(workspaceFormDrafts.id, draftId),
            eq(workspaceFormDrafts.kind, 'idea'),
            eq(workspaceFormDrafts.scope, formScope(recordId)),
          ),
    )
    .limit(1);
}
export function topicFormQuery(recordId: string | null, draftId: string | null = null) {
  return db
    .select({ scope: sql<string>`${formScope(recordId)}`, record: topics, draft: workspaceFormDrafts })
    .from(sql`(select 1) as workspace_seed`)
    .leftJoin(topics, recordId === null ? sql`0` : eq(topics.id, recordId))
    .leftJoin(
      workspaceFormDrafts,
      draftId === null
        ? openFormScope('topic', recordId)
        : and(
            eq(workspaceFormDrafts.id, draftId),
            eq(workspaceFormDrafts.kind, 'topic'),
            eq(workspaceFormDrafts.scope, formScope(recordId)),
          ),
    )
    .limit(1);
}
function requireTitle(title: string) {
  if (!title.trim()) throw new Error('عنوان لازم است.');
}
export const ideaFormPort: FormPort<Idea, IdeaFormFields> = {
  codec: ideaFormCodec,
  query: ideaFormQuery,
  read: (tx, id) => tx.select().from(ideas).where(eq(ideas.id, id)).get() ?? null,
  initial: initialIdeaFields,
  publish(tx, id, fields, now) {
    requireTitle(fields.title);
    if (id === null) return createIdeaInTransaction(tx, fields, now);
    updateIdeaInTransaction(tx, id, fields, now);
    return id;
  },
  describeRecord: (row) => describeIdea(initialIdeaFields(row)),
  describeFields: describeIdea,
};
function describeIdea(fields: IdeaFormFields) {
  return [
    fields.title,
    fields.body,
    fields.area,
    `نوع: ${IDEA_KIND_LABELS[fields.kind]} · وضعیت: ${IDEA_STATUS_LABELS[fields.status]} · اولویت: ${IDEA_PRIORITY_LABELS[fields.priority]}`,
    fields.tags.join('، '),
  ]
    .filter(Boolean)
    .join('\n');
}
export const topicFormPort: FormPort<Topic, TopicFormFields> = {
  codec: topicFormCodec,
  query: topicFormQuery,
  read: (tx, id) => tx.select().from(topics).where(eq(topics.id, id)).get() ?? null,
  initial: initialTopicFields,
  publish(tx, id, fields, now) {
    requireTitle(fields.title);
    const input = topicFormInput(fields, now);
    if (id === null) return createTopicInTransaction(tx, input, now);
    updateTopicInTransaction(tx, id, input, now);
    return id;
  },
  describeRecord: (row) => {
    const fields = initialTopicFields(row, new Date(0));
    if (!row.taughtAt) fields.date.dateText = 'ثبت نشده';
    return describeTopic(fields);
  },
  describeFields: describeTopic,
};
export function describeTopic(fields: TopicFormFields, names?: { teacher?: string; specialty?: string }) {
  return [
    `عنوان: ${fields.title}`,
    `خلاصه: ${fields.summary}`,
    `متن: ${fields.body}`,
    `حرف استاد: ${fields.professorNotes}`,
    `نکته‌ها: ${fields.pearls}`,
    `منبع: ${fields.source}`,
    `محل تدریس: ${fields.context}`,
    `برچسب‌ها: ${fields.tags}`,
    `تاریخ: ${fields.date.dateText}`,
    `استاد: ${fields.taughtById ? (names?.teacher ?? 'نام در دسترس نیست') : 'انتخاب نشده'}`,
    `تخصص: ${fields.specialtyId ? (names?.specialty ?? 'نام در دسترس نیست') : 'انتخاب نشده'}`,
    `ستاره‌دار: ${fields.starred ? 'بله' : 'خیر'} · نیاز به مرور: ${fields.needsReview ? 'بله' : 'خیر'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function specialtyProfileFormQuery(recordId: string | null, draftId: string | null = null) {
  return db
    .select({ scope: sql<string>`${formScope(recordId)}`, record: specialtyProfiles, draft: workspaceFormDrafts })
    .from(sql`(select 1) as workspace_seed`)
    .leftJoin(specialtyProfiles, recordId === null ? sql`0` : eq(specialtyProfiles.id, recordId))
    .leftJoin(
      workspaceFormDrafts,
      draftId === null
        ? openFormScope('specialty-profile', recordId)
        : and(
            eq(workspaceFormDrafts.id, draftId),
            eq(workspaceFormDrafts.kind, 'specialty-profile'),
            eq(workspaceFormDrafts.scope, formScope(recordId)),
          ),
    )
    .limit(1);
}
export function prescriptionFormQuery(recordId: string | null, draftId: string | null = null) {
  return db
    .select({ scope: sql<string>`${formScope(recordId)}`, record: prescriptionTemplates, draft: workspaceFormDrafts })
    .from(sql`(select 1) as workspace_seed`)
    .leftJoin(prescriptionTemplates, recordId === null ? sql`0` : eq(prescriptionTemplates.id, recordId))
    .leftJoin(
      workspaceFormDrafts,
      draftId === null
        ? openFormScope('prescription', recordId)
        : and(
            eq(workspaceFormDrafts.id, draftId),
            eq(workspaceFormDrafts.kind, 'prescription'),
            eq(workspaceFormDrafts.scope, formScope(recordId)),
          ),
    )
    .limit(1);
}
/** Archived original references remain visible without entering the live picker. */
export function specialtyFormReferenceQuery(specialtyId: string | null) {
  return db
    .select({ specialty: { id: specialties.id, nameFa: specialties.nameFa, deletedAt: specialties.deletedAt } })
    .from(sql`(select 1) as specialty_reference`)
    .leftJoin(specialties, specialtyId === null ? sql`0` : eq(specialties.id, specialtyId))
    .limit(1);
}
export const specialtyProfileFormPort: FormPort<SpecialtyProfile, SpecialtyProfileFormFields> = {
  codec: specialtyProfileFormCodec,
  query: specialtyProfileFormQuery,
  read: (tx, id) => tx.select().from(specialtyProfiles).where(eq(specialtyProfiles.id, id)).get() ?? null,
  initial: initialSpecialtyProfileFields,
  publish(tx, id, fields, now) {
    const input = specialtyProfileFormInput(fields);
    if (id === null) return createSpecialtyProfileInTransaction(tx, input, now);
    updateSpecialtyProfileInTransaction(tx, id, input, now);
    return id;
  },
  describeRecord: (row) => describeSpecialtyProfile(initialSpecialtyProfileFields(row)),
  describeFields: describeSpecialtyProfile,
};
export function describeSpecialtyProfile(fields: SpecialtyProfileFormFields, specialtyName?: string) {
  return [
    `رشته: ${fields.specialtyId === null ? 'انتخاب نشده' : (specialtyName ?? 'نام در دسترس نیست')}`,
    `نام دلخواه: ${fields.nameText}`,
    `در یک نگاه: ${fields.overview}`,
    `کار روزمره: ${fields.dailyWork}`,
    `طول رزیدنتی: ${fields.residencyYears}`,
    `سختی ورود: ${fields.entranceDifficulty}`,
    `سبک زندگی: ${fields.lifestyle}`,
    `درآمد: ${fields.incomeNotes}`,
    `بازار کار: ${fields.jobMarket}`,
    `فوق تخصص: ${fields.subspecialtyPaths}`,
    `مزایا: ${fields.prosText}`,
    `معایب: ${fields.consText}`,
    `تناسب شخصی: ${fields.personalFit ?? 'ثبت نشده'}`,
    `نظر شخصی: ${fields.myThoughts}`,
    `منبع: ${fields.sourcesText}`,
    `برچسب‌ها: ${fields.tags}`,
  ].join('\n');
}
export const prescriptionFormPort: FormPort<PrescriptionTemplate, PrescriptionFormFields> = {
  codec: prescriptionFormCodec,
  query: prescriptionFormQuery,
  read: (tx, id) => tx.select().from(prescriptionTemplates).where(eq(prescriptionTemplates.id, id)).get() ?? null,
  initial: initialPrescriptionFields,
  publish(tx, id, fields, now) {
    const input = prescriptionFormInput(fields);
    if (id === null) return createPrescriptionInTransaction(tx, input, now);
    updatePrescriptionInTransaction(tx, id, input, now);
    return id;
  },
  describeRecord: (row) => describePrescription(initialPrescriptionFields(row)),
  describeFields: describePrescription,
};
export function describePrescription(fields: PrescriptionFormFields, specialtyName?: string) {
  return [
    `عنوان: ${fields.title}`,
    `بیماری: ${fields.condition}`,
    `تخصص: ${fields.specialtyId === null ? 'انتخاب نشده' : (specialtyName ?? 'نام در دسترس نیست')}`,
    `گروه سنی: ${fields.ageGroup}`,
    ...fields.items.map(
      ({ key: _key, ...item }, index) =>
        `قلم ${index + 1}: ${Object.entries(item)
          .map(([key, value]) => `${key}: ${value}`)
          .join(' · ')}`,
    ),
    `توصیه‌ها: ${fields.adviceText}`,
    `هشدارها: ${fields.cautionsText}`,
    `پیگیری: ${fields.followUpText}`,
    `برچسب‌ها: ${fields.tags}`,
    `ستاره‌دار: ${fields.starred ? 'بله' : 'خیر'}`,
  ].join('\n');
}
