import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { ideas, topics, workspaceFormDrafts, type Idea, type Topic } from '@/db/schema';
import { openFormScope } from '@/features/workspace-forms/queries';
import type { FormPort } from '@/features/workspace-forms/types';
import { formScope } from '@/lib/form-document';

import {
  ideaFormCodec,
  initialIdeaFields,
  initialTopicFields,
  topicFormCodec,
  topicFormInput,
  type IdeaFormFields,
  type TopicFormFields,
} from './form-draft';
import { createIdeaInTransaction, updateIdeaInTransaction } from './ideas-queries';
import { IDEA_KIND_LABELS, IDEA_PRIORITY_LABELS, IDEA_STATUS_LABELS } from './labels';
import { createTopicInTransaction, updateTopicInTransaction } from './queries';

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
