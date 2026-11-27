import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';

import { AutosaveScope } from '@/components/autosave-scope';
import { CollapsibleSection } from '@/components/collapsible-section';
import { ErrorNotice } from '@/components/error-notice';
import { notify } from '@/components/feedback';
import { PickerModal } from '@/components/picker-modal';
import { QuickDateField } from '@/components/quick-date-field';
import { ScreenOptions } from '@/components/screen-options';
import { Button, ChipSelect, Column, Input, Screen, SectionHeader, SelectField, Toggle } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import { useNow } from '@/components/use-now';
import type { Specialty, Topic } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { doctorDisplayName } from '@/features/doctors/logic';
import { doctorsQuery, quickCreateDoctor, specialtiesQuery } from '@/features/doctors/queries';
import { WorkspaceFormGate } from '@/features/workspace-forms/form-gate';
import { WorkspaceFormDiscard, WorkspaceFormStatus } from '@/features/workspace-forms/form-status';
import type { FormSeed } from '@/features/workspace-forms/types';
import { useWorkspaceForm } from '@/features/workspace-forms/use-form';
import { useTheme } from '@/theme';

import { initialTopicFields, topicFormDate, type TopicFormFields } from './form-draft';
import { describeTopic, topicFormPort } from './form-draft-queries';
import { COMMON_CONTEXTS } from './labels';
import { topicReferencesQuery } from './queries';

/** Write or edit a subject summary. Param: optional `topicId`. */
export function TopicFormScreen() {
  const { topicId, draftId } = useLocalSearchParams<{ topicId?: string; draftId?: string }>();
  return (
    <AutosaveScope>
      <WorkspaceFormGate port={topicFormPort} recordId={topicId ?? null} draftId={draftId ?? null}>
        {(seed, readNotice, unavailable) => <TopicForm seed={seed} readNotice={readNotice} unavailable={unavailable} />}
      </WorkspaceFormGate>
    </AutosaveScope>
  );
}

function TopicForm({
  seed,
  readNotice,
  unavailable,
}: {
  readNotice: ReactNode;
  seed: FormSeed<Topic, TopicFormFields>;
  unavailable: boolean;
}) {
  const router = useRouter();
  const { spacing } = useTheme();
  const isEditing = seed.document.recordId !== null;
  const editing = useWorkspaceForm(topicFormPort, seed, unavailable, () => router.back());
  const {
    title,
    summary,
    body,
    professorNotes,
    pearls,
    source,
    context,
    specialtyId,
    taughtById,
    tags,
    starred,
    needsReview,
  } = editing.document.fields;
  const setTitle = (title: string) => editing.change({ title });
  const setSummary = (summary: string) => editing.change({ summary });
  const setBody = (body: string) => editing.change({ body });
  const setProfessorNotes = (professorNotes: string) => editing.change({ professorNotes });
  const setPearls = (pearls: string) => editing.change({ pearls });
  const setSource = (source: string) => editing.change({ source });
  const setContext = (context: string) => editing.change({ context });
  const setSpecialtyId = (specialtyId: string | null) => editing.change({ specialtyId });
  const setTaughtById = (taughtById: string | null) => editing.change({ taughtById });
  const setTags = (tags: string) => editing.change({ tags });
  const setStarred = (starred: boolean) => editing.change({ starred });
  const setNeedsReview = (needsReview: boolean) => editing.change({ needsReview });
  const now = useNow();
  let taughtAt = new Date(editing.document.fields.dateValue);
  try {
    taughtAt = topicFormDate(editing.document.fields, new Date(now));
  } catch {
    /* Keep incomplete raw date visible. */
  }
  const [picker, setPicker] = useState<'specialty' | 'teacher' | null>(null);
  const dateValidation = useDateValidation();

  const { data: specialtyRows, error: specialtyError, retry: retrySpecialties } = useLive(specialtiesQuery());
  const { data: doctorRows, error: doctorError, retry: retryDoctors } = useLive(doctorsQuery());
  const {
    data: referenceRows,
    error: referenceError,
    retry: retryReferences,
  } = useLive(topicReferencesQuery(taughtById, specialtyId), [taughtById, specialtyId]);

  const specialtyItems = useMemo(
    () =>
      (specialtyRows ?? []).map((s: Specialty) => ({
        id: s.id,
        label: s.nameFa,
        sublabel: s.nameEn,
        keywords: (s.aliases ?? []).join(' '),
      })),
    [specialtyRows],
  );
  const doctorItems = useMemo(
    () => (doctorRows ?? []).map((d) => ({ id: d.id, label: doctorDisplayName(d), sublabel: d.specialtyText })),
    [doctorRows],
  );

  // useLive retains old rows briefly after a selection changes; match the ID.
  const selectedReferences = referenceRows?.[0];
  const teacher = selectedReferences?.teacher?.id === taughtById ? selectedReferences.teacher : null;
  const specialty = selectedReferences?.specialty?.id === specialtyId ? selectedReferences.specialty : null;
  const teacherName = teacher ? `${doctorDisplayName(teacher)}${teacher.deletedAt ? ' (بایگانی‌شده)' : ''}` : null;
  const specialtyName = specialty ? `${specialty.nameFa}${specialty.deletedAt ? ' (بایگانی‌شده)' : ''}` : null;
  function describeFields(fields: TopicFormFields) {
    const liveTeacher = doctorRows?.find((row) => row.id === fields.taughtById);
    return describeTopic(fields, {
      teacher: liveTeacher
        ? doctorDisplayName(liveTeacher)
        : fields.taughtById === taughtById
          ? (teacherName ?? undefined)
          : undefined,
      specialty:
        specialtyRows?.find((row) => row.id === fields.specialtyId)?.nameFa ??
        (fields.specialtyId === specialtyId ? (specialtyName ?? undefined) : undefined),
    });
  }
  function describeRecord(row: Topic) {
    const fields = initialTopicFields(row, new Date(now));
    if (!row.taughtAt) fields.date.dateText = 'ثبت نشده';
    return describeFields(fields);
  }

  function save() {
    if (editing.completed || editing.stale) {
      editing.close();
      return;
    }
    void editing.save((fields) => {
      if (!dateValidation.check()) return false;
      if (!fields.title.trim()) {
        notify('عنوان لازم است');
        return false;
      }
      return true;
    });
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: isEditing ? 'ویرایش مبحث' : 'مبحث جدید' }} />
      <Column
        collapsable={false}
        gap="md"
        style={{ paddingTop: spacing.md }}
        pointerEvents={editing.busy ? 'none' : 'auto'}
      >
        {readNotice}
        <WorkspaceFormStatus
          editing={editing}
          port={topicFormPort}
          describeFields={describeFields}
          describeRecord={describeRecord}
        />
        <Input
          label="عنوان"
          required
          value={title}
          editable={!editing.locked}
          onChangeText={setTitle}
          placeholder="مثلاً ARDS"
        />
        <Input
          label="خلاصه"
          value={summary}
          onChangeText={setSummary}
          multiline
          editable={!editing.locked}
          hint="یک پاراگراف که ماه‌ها بعد کافی باشد"
        />

        <SectionHeader title="از کجا" />
        <ErrorNotice error={doctorError} what="پزشکان" onRetry={retryDoctors} />
        <ErrorNotice error={specialtyError} what="تخصص‌ها" onRetry={retrySpecialties} />
        <ErrorNotice error={referenceError} what="ارتباط‌های مبحث" onRetry={retryReferences} />
        <SelectField
          label="استاد"
          icon="person-outline"
          value={teacherName}
          placeholder="انتخاب از دفترچه‌ی پزشکان"
          onPress={() => {
            if (!editing.locked) setPicker('teacher');
          }}
          onClear={() => setTaughtById(null)}
        />
        <SelectField
          label="تخصص"
          icon="medkit-outline"
          value={specialtyName}
          onPress={() => {
            if (!editing.locked) setPicker('specialty');
          }}
          onClear={() => setSpecialtyId(null)}
        />
        <ChipSelect
          label="کجا تدریس شد"
          options={COMMON_CONTEXTS.map((c) => ({ value: c, label: c }))}
          value={COMMON_CONTEXTS.includes(context) ? context : null}
          onChange={(v) => setContext(v ?? '')}
          allowDeselect
          disabled={editing.locked}
        />
        <Input label="یا خودتان بنویسید" value={context} editable={!editing.locked} onChangeText={setContext} />
        <QuickDateField
          onValidityChange={dateValidation.setValid}
          label="تاریخ"
          value={taughtAt}
          rawInput={editing.document.fields.date}
          onRawInputChange={(patch) => editing.change((fields) => ({ date: { ...fields.date, ...patch } }))}
          disabled={editing.locked}
          direction="past"
        />

        <CollapsibleSection
          title="متن کامل و نکته‌ها"
          icon="document-text-outline"
          defaultOpen={Boolean(body || professorNotes || pearls)}
          filledCount={[body, professorNotes, pearls, source].filter(Boolean).length}
        >
          <Column gap="md">
            <Input label="متن" value={body} editable={!editing.locked} onChangeText={setBody} multiline />
            <Input
              label="عین حرف استاد"
              value={professorNotes}
              onChangeText={setProfessorNotes}
              multiline
              editable={!editing.locked}
              hint="جمله‌هایی که بهتر است با همان لحن بماند"
            />
            <Input
              label="نکته‌های کلیدی"
              value={pearls}
              editable={!editing.locked}
              onChangeText={setPearls}
              multiline
            />
            <Input label="منبع" value={source} editable={!editing.locked} onChangeText={setSource} />
          </Column>
        </CollapsibleSection>

        <Input
          label="برچسب‌ها"
          value={tags}
          editable={!editing.locked}
          onChangeText={setTags}
          hint="با ویرگول جدا کنید"
        />
        <Toggle label="ستاره‌دار" value={starred} onChange={setStarred} disabled={editing.locked} />
        <Toggle
          label="نیاز به مرور"
          description="قبل از امتحان دوباره سراغش بیایید"
          value={needsReview}
          onChange={setNeedsReview}
          disabled={editing.locked}
        />

        <Button
          label={editing.completed || editing.stale ? 'بستن' : isEditing ? 'ذخیره' : 'ثبت مبحث'}
          icon="checkmark"
          onPress={() => void save()}
          loading={editing.busy}
          disabled={editing.busy || (editing.locked && !editing.completed && !editing.stale)}
          full
        />
        <Button label="بستن" variant="ghost" disabled={editing.busy} onPress={editing.close} full haptic={false} />
        <WorkspaceFormDiscard editing={editing} />
      </Column>

      <PickerModal
        visible={picker === 'teacher'}
        title="استاد"
        items={doctorItems}
        selectedId={taughtById}
        onClose={() => setPicker(null)}
        onSelect={(item) => {
          setTaughtById(item.id);
          setPicker(null);
        }}
        onCreate={(name) => editing.related(() => quickCreateDoctor(name))}
        createLabel="افزودن پزشک"
        emptyText="هنوز پزشکی ثبت نشده — نامش را بنویسید و اضافه کنید."
      />

      <PickerModal
        visible={picker === 'specialty'}
        title="تخصص"
        items={specialtyItems}
        selectedId={specialtyId}
        onClose={() => setPicker(null)}
        onSelect={(item) => {
          setSpecialtyId(item.id);
          setPicker(null);
        }}
        emptyText="تخصصی با این نام نیست"
      />
    </Screen>
  );
}
