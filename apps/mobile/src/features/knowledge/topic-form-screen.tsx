import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';

import { CollapsibleSection } from '@/components/collapsible-section';
import { EditGate } from '@/components/edit-gate';
import { alertError } from '@/components/feedback';
import { PickerModal } from '@/components/picker-modal';
import { QuickDateField } from '@/components/quick-date-field';
import { ScreenOptions } from '@/components/screen-options';
import { Button, ChipSelect, Column, Input, Screen, SectionHeader, SelectField, Toggle } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import type { Specialty } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { doctorDisplayName } from '@/features/doctors/logic';
import { doctorsQuery, quickCreateDoctor, specialtiesQuery } from '@/features/doctors/queries';
import { useTheme } from '@/theme';

import { COMMON_CONTEXTS } from './labels';
import { createTopic, topicQuery, updateTopic } from './queries';

const toList = (text: string) =>
  text
    .split(/[,،]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Write or edit a subject summary. Param: optional `topicId`. */
export function TopicFormScreen() {
  const { topicId } = useLocalSearchParams<{ topicId?: string }>();
  const { data, error, retry } = useLive(topicQuery(topicId ?? ''), [topicId]);
  return (
    <EditGate editing={Boolean(topicId)} rows={data} error={error} onRetry={retry} what="مبحث">
      {(row, readNotice) => <TopicForm readNotice={readNotice} row={row} />}
    </EditGate>
  );
}

type TopicRow = NonNullable<Awaited<ReturnType<typeof topicQuery>>[number]>;

function TopicForm({ row, readNotice }: { readNotice: ReactNode; row: TopicRow | null }) {
  const router = useRouter();
  const { spacing } = useTheme();
  const topic = row?.topic ?? null;

  const [title, setTitle] = useState(topic?.title ?? '');
  const [summary, setSummary] = useState(topic?.summary ?? '');
  const [body, setBody] = useState(topic?.body ?? '');
  const [professorNotes, setProfessorNotes] = useState(topic?.professorNotes ?? '');
  const [pearls, setPearls] = useState(topic?.pearls ?? '');
  const [source, setSource] = useState(topic?.source ?? '');
  const [context, setContext] = useState(topic?.context ?? '');
  const [taughtAt, setTaughtAt] = useState<Date>(topic?.taughtAt ?? new Date());
  const [specialtyId, setSpecialtyId] = useState<string | null>(topic?.specialtyId ?? null);
  const [taughtById, setTaughtById] = useState<string | null>(topic?.taughtById ?? null);
  const [tags, setTags] = useState((topic?.tags ?? []).join('، '));
  const [starred, setStarred] = useState(topic?.starred ?? false);
  const [needsReview, setNeedsReview] = useState(topic?.needsReview ?? false);
  const [picker, setPicker] = useState<'specialty' | 'teacher' | null>(null);
  const [saving, setSaving] = useState(false);
  const dateValidation = useDateValidation();

  const { data: specialtyRows } = useLive(specialtiesQuery());
  const { data: doctorRows } = useLive(doctorsQuery());

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

  const specialtyName = specialtyRows?.find((s) => s.id === specialtyId)?.nameFa ?? null;
  const teacherName = doctorRows?.find((d) => d.id === taughtById);

  async function save() {
    if (!dateValidation.check()) return;
    if (!title.trim()) {
      Alert.alert('عنوان لازم است');
      return;
    }
    setSaving(true);
    const payload = {
      title,
      summary,
      body,
      professorNotes,
      pearls,
      source,
      context,
      taughtAt,
      specialtyId,
      taughtById,
      tags: toList(tags),
      starred,
      needsReview,
    };
    try {
      if (topic) await updateTopic(topic.id, payload);
      else await createTopic(payload);
      router.back();
    } catch (e) {
      alertError('ذخیره نشد', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: topic ? 'ویرایش مبحث' : 'مبحث جدید' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {readNotice}
        <Input label="عنوان" required value={title} onChangeText={setTitle} placeholder="مثلاً ARDS" />
        <Input
          label="خلاصه"
          value={summary}
          onChangeText={setSummary}
          multiline
          hint="یک پاراگراف که ماه‌ها بعد کافی باشد"
        />

        <SectionHeader title="از کجا" />
        <SelectField
          label="استاد"
          icon="person-outline"
          value={teacherName ? doctorDisplayName(teacherName) : null}
          placeholder="انتخاب از دفترچه‌ی پزشکان"
          onPress={() => setPicker('teacher')}
          onClear={() => setTaughtById(null)}
        />
        <SelectField
          label="تخصص"
          icon="medkit-outline"
          value={specialtyName}
          onPress={() => setPicker('specialty')}
          onClear={() => setSpecialtyId(null)}
        />
        <ChipSelect
          label="کجا تدریس شد"
          options={COMMON_CONTEXTS.map((c) => ({ value: c, label: c }))}
          value={COMMON_CONTEXTS.includes(context) ? context : null}
          onChange={(v) => setContext(v ?? '')}
          allowDeselect
        />
        <Input label="یا خودتان بنویسید" value={context} onChangeText={setContext} />
        <QuickDateField
          onValidityChange={dateValidation.setValid}
          label="تاریخ"
          value={taughtAt}
          onChange={setTaughtAt}
          direction="past"
        />

        <CollapsibleSection
          title="متن کامل و نکته‌ها"
          icon="document-text-outline"
          defaultOpen={Boolean(body || professorNotes || pearls)}
          filledCount={[body, professorNotes, pearls, source].filter(Boolean).length}
        >
          <Column gap="md">
            <Input label="متن" value={body} onChangeText={setBody} multiline />
            <Input
              label="عین حرف استاد"
              value={professorNotes}
              onChangeText={setProfessorNotes}
              multiline
              hint="جمله‌هایی که بهتر است با همان لحن بماند"
            />
            <Input label="نکته‌های کلیدی" value={pearls} onChangeText={setPearls} multiline />
            <Input label="منبع" value={source} onChangeText={setSource} />
          </Column>
        </CollapsibleSection>

        <Input label="برچسب‌ها" value={tags} onChangeText={setTags} hint="با ویرگول جدا کنید" />
        <Toggle label="ستاره‌دار" value={starred} onChange={setStarred} />
        <Toggle
          label="نیاز به مرور"
          description="قبل از امتحان دوباره سراغش بیایید"
          value={needsReview}
          onChange={setNeedsReview}
        />

        <Button
          label={topic ? 'ذخیره' : 'ثبت مبحث'}
          icon="checkmark"
          onPress={() => void save()}
          loading={saving}
          full
        />
        <Button label="انصراف" variant="ghost" onPress={() => router.back()} full haptic={false} />
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
        onCreate={quickCreateDoctor}
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
