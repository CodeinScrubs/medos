import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';

import { AutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { notify } from '@/components/feedback';
import { PickerModal } from '@/components/picker-modal';
import { ScreenOptions } from '@/components/screen-options';
import { Button, ChipSelect, Column, Input, Screen, SectionHeader, SelectField, Text } from '@/components/ui';
import type { Specialty, SpecialtyProfile } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { specialtiesQuery } from '@/features/doctors/queries';
import { WorkspaceFormGate } from '@/features/workspace-forms/form-gate';
import { WorkspaceFormDiscard, WorkspaceFormStatus } from '@/features/workspace-forms/form-status';
import type { FormSeed } from '@/features/workspace-forms/types';
import { useWorkspaceForm } from '@/features/workspace-forms/use-form';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { initialSpecialtyProfileFields, type SpecialtyProfileFormFields } from './form-draft';
import { describeSpecialtyProfile, specialtyFormReferenceQuery, specialtyProfileFormPort } from './form-draft-queries';

const FIT_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: toPersianDigits(n) }));

/** Research one field. Param: optional `profileId`. */
export function SpecialtyFormScreen() {
  const { profileId, draftId } = useLocalSearchParams<{ profileId?: string; draftId?: string }>();
  return (
    <AutosaveScope>
      <WorkspaceFormGate port={specialtyProfileFormPort} recordId={profileId ?? null} draftId={draftId ?? null}>
        {(seed, readNotice, unavailable) => (
          <SpecialtyForm readNotice={readNotice} seed={seed} unavailable={unavailable} />
        )}
      </WorkspaceFormGate>
    </AutosaveScope>
  );
}

function SpecialtyForm({
  seed,
  readNotice,
  unavailable,
}: {
  readNotice: ReactNode;
  seed: FormSeed<SpecialtyProfile, SpecialtyProfileFormFields>;
  unavailable: boolean;
}) {
  const router = useRouter();
  const { spacing } = useTheme();
  const isEditing = seed.document.recordId !== null;
  const editing = useWorkspaceForm(specialtyProfileFormPort, seed, unavailable, () => router.back());
  const {
    specialtyId,
    nameText,
    overview,
    dailyWork,
    residencyYears,
    entranceDifficulty,
    lifestyle,
    incomeNotes,
    jobMarket,
    subspecialtyPaths,
    prosText,
    consText,
    personalFit,
    myThoughts,
    sourcesText,
    tags,
  } = editing.document.fields;
  const setSpecialtyId = (specialtyId: string | null) => editing.change({ specialtyId });
  const setNameText = (nameText: string) => editing.change({ nameText });
  const setOverview = (overview: string) => editing.change({ overview });
  const setDailyWork = (dailyWork: string) => editing.change({ dailyWork });
  const setResidencyYears = (residencyYears: string) => editing.change({ residencyYears });
  const setEntranceDifficulty = (entranceDifficulty: string) => editing.change({ entranceDifficulty });
  const setLifestyle = (lifestyle: string) => editing.change({ lifestyle });
  const setIncomeNotes = (incomeNotes: string) => editing.change({ incomeNotes });
  const setJobMarket = (jobMarket: string) => editing.change({ jobMarket });
  const setSubspecialtyPaths = (subspecialtyPaths: string) => editing.change({ subspecialtyPaths });
  const setProsText = (prosText: string) => editing.change({ prosText });
  const setConsText = (consText: string) => editing.change({ consText });
  const setPersonalFit = (personalFit: number | null) => editing.change({ personalFit });
  const setMyThoughts = (myThoughts: string) => editing.change({ myThoughts });
  const setSourcesText = (sourcesText: string) => editing.change({ sourcesText });
  const setTags = (tags: string) => editing.change({ tags });
  const [picking, setPicking] = useState(false);

  const { data: specialtyRows, error: specialtyError, retry: retrySpecialties } = useLive(specialtiesQuery());
  const {
    data: referenceRows,
    error: referenceError,
    retry: retryReferences,
  } = useLive(specialtyFormReferenceQuery(specialtyId), [specialtyId]);
  const liveSpecialtyItems = useMemo(
    () =>
      (specialtyRows ?? []).map((s: Specialty) => ({
        id: s.id,
        label: s.nameFa,
        sublabel: s.nameEn,
        keywords: (s.aliases ?? []).join(' '),
      })),
    [specialtyRows],
  );
  const selected = referenceRows?.[0]?.specialty;
  const currentSpecialty = selected?.id === specialtyId ? selected : null;
  const currentName = currentSpecialty
    ? `${currentSpecialty.nameFa}${currentSpecialty.deletedAt ? ' (بایگانی‌شده)' : ''}`
    : null;
  // Only a display label is retained; replacement reads never accompany old fields.
  const [retainedName, setRetainedName] = useState(() => (editing.stale ? null : currentName));
  if (!editing.stale && retainedName !== currentName) setRetainedName(currentName);
  const specialtyItems = editing.stale ? [] : liveSpecialtyItems;
  const specialtyName = editing.stale ? retainedName : currentName;
  function describeFields(fields: SpecialtyProfileFormFields) {
    return describeSpecialtyProfile(
      fields,
      (!editing.stale ? specialtyRows?.find((row) => row.id === fields.specialtyId)?.nameFa : undefined) ??
        (fields.specialtyId === specialtyId ? (specialtyName ?? undefined) : undefined),
    );
  }

  function save() {
    if (editing.completed || editing.stale) {
      editing.close();
      return;
    }
    void editing.save((fields) => {
      if (fields.specialtyId === null && !fields.nameText.trim()) {
        notify('رشته را انتخاب کنید', 'یا نامش را دستی بنویسید.');
        return false;
      }
      return true;
    });
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: isEditing ? 'ویرایش رشته' : 'رشته‌ی جدید' }} />
      <Column
        collapsable={false}
        gap="md"
        style={{ paddingTop: spacing.md }}
        pointerEvents={editing.busy ? 'none' : 'auto'}
      >
        {readNotice}
        <WorkspaceFormStatus
          port={specialtyProfileFormPort}
          editing={editing}
          describeFields={describeFields}
          describeRecord={(row) => describeFields(initialSpecialtyProfileFields(row))}
        />
        <ErrorNotice error={specialtyError} what="تخصص‌ها" onRetry={retrySpecialties} />
        <ErrorNotice error={referenceError} what="رشتهٔ انتخاب‌شده" onRetry={retryReferences} />
        <SelectField
          label="رشته"
          disabled={editing.locked}
          icon="medkit-outline"
          value={specialtyName}
          placeholder="انتخاب از فهرست"
          onPress={() => {
            if (!editing.locked) setPicking(true);
          }}
          onClear={() => setSpecialtyId(null)}
        />
        <Input
          editable={!editing.locked}
          label="یا نام دلخواه"
          value={nameText}
          onChangeText={setNameText}
          hint="اگر در فهرست نیست"
        />

        <SectionHeader title="کار روزمره" />
        <Input editable={!editing.locked} label="در یک نگاه" value={overview} onChangeText={setOverview} multiline />
        <Input
          editable={!editing.locked}
          label="یک روز کاری چطور است"
          value={dailyWork}
          onChangeText={setDailyWork}
          multiline
        />
        <Input
          editable={!editing.locked}
          label="طول رزیدنتی"
          value={residencyYears}
          onChangeText={setResidencyYears}
          placeholder="۴ سال"
        />
        <Input
          editable={!editing.locked}
          label="سختی ورود"
          value={entranceDifficulty}
          onChangeText={setEntranceDifficulty}
        />
        <Input editable={!editing.locked} label="سبک زندگی" value={lifestyle} onChangeText={setLifestyle} multiline />
        <Input editable={!editing.locked} label="درآمد" value={incomeNotes} onChangeText={setIncomeNotes} multiline />
        <Input editable={!editing.locked} label="بازار کار" value={jobMarket} onChangeText={setJobMarket} multiline />
        <Input
          editable={!editing.locked}
          label="مسیرهای فوق تخصص"
          value={subspecialtyPaths}
          onChangeText={setSubspecialtyPaths}
          multiline
        />

        <SectionHeader title="جمع‌بندی خودم" />
        <Input editable={!editing.locked} label="مزایا" value={prosText} onChangeText={setProsText} multiline />
        <Input editable={!editing.locked} label="معایب" value={consText} onChangeText={setConsText} multiline />
        <ChipSelect
          label="چقدر به من می‌خورد"
          options={FIT_OPTIONS}
          value={personalFit == null ? null : String(personalFit)}
          onChange={(v) => setPersonalFit(v == null ? null : Number(v))}
          allowDeselect
          disabled={editing.locked}
        />
        {personalFit !== null && (!Number.isInteger(personalFit) || personalFit < 1 || personalFit > 5) ? (
          <Text color="danger" variant="tiny">
            امتیاز قبلی {toPersianDigits(personalFit)} است؛ از ۱ تا ۵ انتخاب کنید یا پاک کنید.
          </Text>
        ) : null}
        <Input editable={!editing.locked} label="نظر شخصی" value={myThoughts} onChangeText={setMyThoughts} multiline />
        <Input
          editable={!editing.locked}
          label="از چه کسی شنیدم"
          value={sourcesText}
          onChangeText={setSourcesText}
          multiline
          hint="تا بعداً بشود وزن حرف‌ها را سنجید"
        />
        <Input
          editable={!editing.locked}
          label="برچسب‌ها"
          value={tags}
          onChangeText={setTags}
          hint="با ویرگول جدا کنید"
        />

        <Button
          label={editing.completed || editing.stale ? 'بستن' : isEditing ? 'ذخیره' : 'ثبت رشته'}
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
        visible={picking}
        title="رشته"
        items={specialtyItems}
        selectedId={specialtyId}
        onClose={() => setPicking(false)}
        onSelect={(item) => {
          setSpecialtyId(item.id);
          setPicking(false);
        }}
        emptyText="رشته‌ای با این نام نیست"
      />
    </Screen>
  );
}
