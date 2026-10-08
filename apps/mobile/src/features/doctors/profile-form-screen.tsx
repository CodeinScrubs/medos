import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';

import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { notify } from '@/components/feedback';
import { JalaliDateField } from '@/components/jalali-date-field';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Column, Input, Screen, SectionHeader, Text } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import { useNow } from '@/components/use-now';
import type { DoctorProfile } from '@/db/schema';
import { dateInputText, validateDateInput } from '@/lib/date-input';
import { fromIsoDate } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { changedFormPatch } from './edit-basis';
import { ManualDoctorGate, useManualDoctorForm } from './manual-form';
import { doctorProfileFormQuery, saveDoctorProfile } from './ratings-queries';

const toList = (text: string) =>
  text
    .split(/[,،]/)
    .map((s) => s.trim())
    .filter(Boolean);

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
    <ManualDoctorGate key={doctorId} query={doctorProfileFormQuery(doctorId ?? '')} what="پروفایل پزشک">
      {(row, notice, generation, unavailable) =>
        row ? (
          <ProfileForm
            doctorId={row.doctor.id}
            profile={row.profile}
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
  doctorId,
  profile,
  readNotice,
  generation,
  unavailable,
}: {
  doctorId: string;
  profile: DoctorProfile | null;
  readNotice: ReactNode;
  generation: number;
  unavailable: boolean;
}) {
  const { spacing } = useTheme();
  const now = useNow();
  const birth = fromIsoDate(profile?.birthDate);
  const editing = useManualDoctorForm(
    {
      birthDate: birth ? dateInputText(birth) : '',
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
    },
    generation,
    unavailable,
  );
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
    await editing.submit(async (current) => {
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
      } = current;
      const date = validateDateInput(birthDate, { now: new Date(now), required: false, allowFuture: false });
      if (!dateValidation.check() || !date.valid) {
        if (!date.valid) notify('تاریخ تولد معتبر نیست');
        return false;
      }
      const payload = {
        birthDate: date.iso,
        hometown: hometown.trim() || null,
        almaMater: almaMater.trim() || null,
        graduationYear: graduationYear.trim() || null,
        familyNotes: familyNotes.trim() || null,
        interests: toList(interests),
        favoriteTopics: favoriteTopics.trim() || null,
        dislikes: dislikes.trim() || null,
        howWeMet: howWeMet.trim() || null,
        memorableMoments: memorableMoments.trim() || null,
        communicationStyle: communicationStyle.trim() || null,
        personalNotes: personalNotes.trim() || null,
      };
      await saveDoctorProfile(doctorId, changedFormPatch(editing.basis, current, payload), profile);
      return true;
    });
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: 'پروفایل شخصی' }} />
      <Column collapsable={false} gap="md" style={{ paddingTop: spacing.md }}>
        {readNotice}
        {editing.completed ? <Text>ذخیره شد؛ برای برگشت، «بستن» را بزنید.</Text> : null}
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
          onPress={() => {
            if (editing.completed) editing.close();
            else void save();
          }}
          disabled={locked && !editing.completed}
          loading={saving}
          full
        />
        {!editing.completed ? (
          <Button label="انصراف" variant="ghost" onPress={editing.close} disabled={saving} full haptic={false} />
        ) : null}
      </Column>
    </Screen>
  );
}
