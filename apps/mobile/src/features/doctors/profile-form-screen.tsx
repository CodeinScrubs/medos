import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';

import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { notify } from '@/components/feedback';
import { JalaliDateField } from '@/components/jalali-date-field';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Column, Input, Screen, SectionHeader, Text } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import { useNow } from '@/components/use-now';
import { validateDateInput } from '@/lib/date-input';
import { useTheme } from '@/theme';

import type { DoctorFormRow } from './form-draft-queries';
import { DoctorDraftDiscard, DoctorDraftNotice, ManualDoctorGate, useManualDoctorForm } from './manual-form';

/**
 * The social layer: where they are from, what they like, how we met.
 *
 * It exists because a working relationship with a consultant is easier when
 * you remember that they trained in Tabriz and hate being called after ten.
 * Private notes about a named person — never shared, never exported by
 * default.
 *
 * Param: `doctorId`.
 */
export function ProfileFormScreen() {
  const { doctorId } = useLocalSearchParams<{ doctorId: string }>();
  const parent = useAutosaveScope();
  const form = (
    <ManualDoctorGate key={doctorId} kind="profile" doctorId={doctorId ?? ''} what="پروفایل پزشک">
      {(row, notice, generation, unavailable, onReset) =>
        row ? (
          <ProfileForm
            seed={row}
            onReset={onReset}
            readNotice={notice}
            generation={generation}
            unavailable={unavailable}
          />
        ) : null
      }
    </ManualDoctorGate>
  );
  return parent ? form : <AutosaveScope key={doctorId}>{form}</AutosaveScope>;
}

function ProfileForm({
  seed,
  onReset,
  readNotice,
  generation,
  unavailable,
}: {
  seed: DoctorFormRow;
  onReset: (row: DoctorFormRow) => void;
  readNotice: ReactNode;
  generation: number;
  unavailable: boolean;
}) {
  const { spacing } = useTheme();
  const now = useNow();
  const profile = seed.profile;
  const editing = useManualDoctorForm('profile', seed, generation, unavailable, onReset);
  const {
    birthDate,
    hometown,
    almaMater,
    graduationYear,
    familyNotes,
    interests,
    favoriteTopics,
    dislikes,
    howWeMet,
    memorableMoments,
    communicationStyle,
    personalNotes,
  } = editing.fields;
  const setBirthDate = (value: typeof birthDate) => editing.change({ birthDate: value });
  const setHometown = (value: typeof hometown) => editing.change({ hometown: value });
  const setAlmaMater = (value: typeof almaMater) => editing.change({ almaMater: value });
  const setGraduationYear = (value: typeof graduationYear) => editing.change({ graduationYear: value });
  const setFamilyNotes = (value: typeof familyNotes) => editing.change({ familyNotes: value });
  const setInterests = (value: typeof interests) => editing.change({ interests: value });
  const setFavoriteTopics = (value: typeof favoriteTopics) => editing.change({ favoriteTopics: value });
  const setDislikes = (value: typeof dislikes) => editing.change({ dislikes: value });
  const setHowWeMet = (value: typeof howWeMet) => editing.change({ howWeMet: value });
  const setMemorableMoments = (value: typeof memorableMoments) => editing.change({ memorableMoments: value });
  const setCommunicationStyle = (value: typeof communicationStyle) => editing.change({ communicationStyle: value });
  const setPersonalNotes = (value: typeof personalNotes) => editing.change({ personalNotes: value });
  const { busy: saving, locked } = editing;
  const dateValidation = useDateValidation();

  async function save() {
    await editing.submit((current) => {
      const date = validateDateInput(current.birthDate, { now: new Date(now), required: false, allowFuture: false });
      if (!dateValidation.check() || !date.valid) {
        if (!date.valid) notify('تاریخ تولد معتبر نیست');
        return false;
      }
      return true;
    }, new Date(now));
  }

  function finish() {
    if (editing.completed) editing.close();
    else void save();
  }
  return (
    <Screen scroll>
      <ScreenOptions
        options={{
          title: 'پروفایل شخصی',
          headerRight: () => (
            <Button
              label={editing.completed ? 'بستن' : 'ذخیره'}
              size="sm"
              variant="ghost"
              onPress={finish}
              disabled={locked && !editing.completed}
              loading={saving}
            />
          ),
        }}
      />
      <Column collapsable={false} gap="md" style={{ paddingTop: spacing.md }}>
        {readNotice}
        <DoctorDraftNotice editing={editing} recovered={!!seed.draft} />
        <Text variant="tiny" color="textFaint">
          یادداشت خصوصی شماست. برای تبریک تولد، کافی است تاریخ تولد را بنویسید و بعد از ذخیره، مناسبت تولد را اضافه
          کنید.
        </Text>

        <JalaliDateField
          onValidityChange={dateValidation.setValid}
          label="تاریخ تولد"
          value={profile?.birthDate ?? null}
          rawText={birthDate}
          onRawTextChange={setBirthDate}
          editable={!locked}
          onChange={() => {}}
        />
        <Input editable={!locked} label="زادگاه" value={hometown} onChangeText={setHometown} />
        <Input editable={!locked} label="دانشگاه" value={almaMater} onChangeText={setAlmaMater} />
        <Input
          editable={!locked}
          label="سال فارغ‌التحصیلی"
          value={graduationYear}
          onChangeText={setGraduationYear}
          numericFold
        />

        <SectionHeader title="شناختن بهتر" />
        <Input
          editable={!locked}
          label="علایق"
          value={interests}
          onChangeText={setInterests}
          hint="با ویرگول جدا کنید"
        />
        <Input
          editable={!locked}
          label="موضوع‌های مورد علاقه"
          value={favoriteTopics}
          onChangeText={setFavoriteTopics}
          multiline
        />
        <Input
          editable={!locked}
          label="چیزهایی که خوشش نمی‌آید"
          value={dislikes}
          onChangeText={setDislikes}
          multiline
        />
        <Input editable={!locked} label="خانواده" value={familyNotes} onChangeText={setFamilyNotes} multiline />

        <SectionHeader title="سابقه‌ی آشنایی" />
        <Input editable={!locked} label="چطور آشنا شدیم" value={howWeMet} onChangeText={setHowWeMet} multiline />
        <Input
          editable={!locked}
          label="خاطره‌ها"
          value={memorableMoments}
          onChangeText={setMemorableMoments}
          multiline
        />
        <Input
          editable={!locked}
          label="سبک ارتباط"
          value={communicationStyle}
          onChangeText={setCommunicationStyle}
          multiline
          placeholder="مثلاً: پیام را بهتر از تماس جواب می‌دهد؛ بعد از ساعت ۲۲ زنگ نزنید."
        />
        <Input
          editable={!locked}
          label="یادداشت شخصی"
          value={personalNotes}
          onChangeText={setPersonalNotes}
          multiline
        />

        <Button
          label={editing.completed ? 'بستن' : 'ذخیره'}
          icon="checkmark"
          onPress={finish}
          disabled={locked && !editing.completed}
          loading={saving}
          full
        />
        <DoctorDraftDiscard editing={editing} />
        {!editing.completed ? (
          <Button label="انصراف" variant="ghost" onPress={editing.close} disabled={saving} full haptic={false} />
        ) : null}
      </Column>
    </Screen>
  );
}
