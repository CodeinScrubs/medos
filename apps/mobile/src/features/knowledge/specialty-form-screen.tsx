import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';

import { EditGate } from '@/components/edit-gate';
import { alertError } from '@/components/feedback';
import { PickerModal } from '@/components/picker-modal';
import { ScreenOptions } from '@/components/screen-options';
import { Button, ChipSelect, Column, Input, Screen, SectionHeader, SelectField, Text } from '@/components/ui';
import type { Specialty } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { specialtiesQuery } from '@/features/doctors/queries';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { createSpecialtyProfile, specialtyProfileQuery, updateSpecialtyProfile } from './specialty-profiles-queries';

const FIT_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: toPersianDigits(n) }));

const toList = (text: string) =>
  text
    .split(/[,،]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Research one field. Param: optional `profileId`. */
export function SpecialtyFormScreen() {
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();
  const { data, error, retry } = useLive(specialtyProfileQuery(profileId ?? ''), [profileId]);
  return (
    <EditGate editing={Boolean(profileId)} rows={data} error={error} onRetry={retry} what="رشته">
      {(row, readNotice) => <SpecialtyForm readNotice={readNotice} row={row} />}
    </EditGate>
  );
}

type ProfileRow = NonNullable<Awaited<ReturnType<typeof specialtyProfileQuery>>[number]>;

function SpecialtyForm({ row, readNotice }: { readNotice: ReactNode; row: ProfileRow | null }) {
  const router = useRouter();
  const { spacing } = useTheme();
  const profile = row?.profile ?? null;

  const [specialtyId, setSpecialtyId] = useState<string | null>(profile?.specialtyId ?? null);
  const [nameText, setNameText] = useState(profile?.nameText ?? '');
  const [overview, setOverview] = useState(profile?.overview ?? '');
  const [dailyWork, setDailyWork] = useState(profile?.dailyWork ?? '');
  const [residencyYears, setResidencyYears] = useState(profile?.residencyYears ?? '');
  const [entranceDifficulty, setEntranceDifficulty] = useState(profile?.entranceDifficulty ?? '');
  const [lifestyle, setLifestyle] = useState(profile?.lifestyle ?? '');
  const [incomeNotes, setIncomeNotes] = useState(profile?.incomeNotes ?? '');
  const [jobMarket, setJobMarket] = useState(profile?.jobMarket ?? '');
  const [subspecialtyPaths, setSubspecialtyPaths] = useState(profile?.subspecialtyPaths ?? '');
  const [prosText, setProsText] = useState(profile?.prosText ?? '');
  const [consText, setConsText] = useState(profile?.consText ?? '');
  const [personalFit, setPersonalFit] = useState<number | null>(profile?.personalFit ?? null);
  const [myThoughts, setMyThoughts] = useState(profile?.myThoughts ?? '');
  const [sourcesText, setSourcesText] = useState(profile?.sourcesText ?? '');
  const [tags, setTags] = useState((profile?.tags ?? []).join('، '));
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: specialtyRows } = useLive(specialtiesQuery());
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
  const specialtyName = specialtyRows?.find((s) => s.id === specialtyId)?.nameFa ?? null;

  async function save() {
    if (!specialtyId && !nameText.trim()) {
      Alert.alert('رشته را انتخاب کنید', 'یا نامش را دستی بنویسید.');
      return;
    }
    setSaving(true);
    const payload = {
      specialtyId,
      nameText: nameText.trim() || null,
      overview: overview.trim() || null,
      dailyWork: dailyWork.trim() || null,
      residencyYears: residencyYears.trim() || null,
      entranceDifficulty: entranceDifficulty.trim() || null,
      lifestyle: lifestyle.trim() || null,
      incomeNotes: incomeNotes.trim() || null,
      jobMarket: jobMarket.trim() || null,
      subspecialtyPaths: subspecialtyPaths.trim() || null,
      prosText: prosText.trim() || null,
      consText: consText.trim() || null,
      personalFit,
      myThoughts: myThoughts.trim() || null,
      sourcesText: sourcesText.trim() || null,
      tags: toList(tags),
    };
    try {
      if (profile) await updateSpecialtyProfile(profile.id, payload);
      else await createSpecialtyProfile(payload);
      router.back();
    } catch (e) {
      alertError('ذخیره نشد', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: profile ? 'ویرایش رشته' : 'رشته‌ی جدید' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {readNotice}
        <SelectField
          label="رشته"
          icon="medkit-outline"
          value={specialtyName}
          placeholder="انتخاب از فهرست"
          onPress={() => setPicking(true)}
          onClear={() => setSpecialtyId(null)}
        />
        <Input label="یا نام دلخواه" value={nameText} onChangeText={setNameText} hint="اگر در فهرست نیست" />

        <SectionHeader title="کار روزمره" />
        <Input label="در یک نگاه" value={overview} onChangeText={setOverview} multiline />
        <Input label="یک روز کاری چطور است" value={dailyWork} onChangeText={setDailyWork} multiline />
        <Input label="طول رزیدنتی" value={residencyYears} onChangeText={setResidencyYears} placeholder="۴ سال" />
        <Input label="سختی ورود" value={entranceDifficulty} onChangeText={setEntranceDifficulty} />
        <Input label="سبک زندگی" value={lifestyle} onChangeText={setLifestyle} multiline />
        <Input label="درآمد" value={incomeNotes} onChangeText={setIncomeNotes} multiline />
        <Input label="بازار کار" value={jobMarket} onChangeText={setJobMarket} multiline />
        <Input label="مسیرهای فوق تخصص" value={subspecialtyPaths} onChangeText={setSubspecialtyPaths} multiline />

        <SectionHeader title="جمع‌بندی خودم" />
        <Input label="مزایا" value={prosText} onChangeText={setProsText} multiline />
        <Input label="معایب" value={consText} onChangeText={setConsText} multiline />
        <ChipSelect
          label="چقدر به من می‌خورد"
          options={FIT_OPTIONS}
          value={personalFit == null ? null : String(personalFit)}
          onChange={(v) => setPersonalFit(v == null ? null : Number(v))}
          allowDeselect
        />
        <Input label="نظر شخصی" value={myThoughts} onChangeText={setMyThoughts} multiline />
        <Input
          label="از چه کسی شنیدم"
          value={sourcesText}
          onChangeText={setSourcesText}
          multiline
          hint="تا بعداً بشود وزن حرف‌ها را سنجید"
        />
        <Input label="برچسب‌ها" value={tags} onChangeText={setTags} hint="با ویرگول جدا کنید" />
        <Text variant="tiny" color="textFaint">
          این صفحه یادداشت خودتان است، نه مشاوره‌ی شغلی.
        </Text>

        <Button
          label={profile ? 'ذخیره' : 'ثبت رشته'}
          icon="checkmark"
          onPress={() => void save()}
          loading={saving}
          full
        />
        <Button label="انصراف" variant="ghost" onPress={() => router.back()} full haptic={false} />
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
