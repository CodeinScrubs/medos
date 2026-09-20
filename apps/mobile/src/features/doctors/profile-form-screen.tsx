import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { alertError } from '@/components/feedback';
import { JalaliDateField } from '@/components/jalali-date-field';
import { Button, Column, Input, Screen, SectionHeader, Text } from '@/components/ui';
import type { DoctorProfile } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { useTheme } from '@/theme';

import { doctorProfileQuery, saveDoctorProfile } from './ratings-queries';

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
  const { data } = useLive(doctorProfileQuery(doctorId ?? ''), [doctorId]);
  // Not the usual edit-or-new decision: there is one profile row per doctor,
  // written if it exists and created if it does not. So this waits for the
  // read and then always renders the form — "no row yet" is the normal case,
  // not the "it was deleted" case `EditGate` is for.
  if (!data) return <Loading />;
  return <ProfileForm doctorId={doctorId} profile={data[0] ?? null} />;
}

function Loading() {
  const { colors, spacing } = useTheme();
  return (
    <Screen>
      <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.huge }} />
    </Screen>
  );
}

function ProfileForm({ doctorId, profile }: { doctorId: string; profile: DoctorProfile | null }) {
  const router = useRouter();
  const { spacing } = useTheme();

  const [birthDate, setBirthDate] = useState(profile?.birthDate ?? null);
  const [hometown, setHometown] = useState(profile?.hometown ?? '');
  const [almaMater, setAlmaMater] = useState(profile?.almaMater ?? '');
  const [graduationYear, setGraduationYear] = useState(profile?.graduationYear ?? '');
  const [familyNotes, setFamilyNotes] = useState(profile?.familyNotes ?? '');
  const [interests, setInterests] = useState((profile?.interests ?? []).join('، '));
  const [favoriteTopics, setFavoriteTopics] = useState(profile?.favoriteTopics ?? '');
  const [dislikes, setDislikes] = useState(profile?.dislikes ?? '');
  const [howWeMet, setHowWeMet] = useState(profile?.howWeMet ?? '');
  const [memorableMoments, setMemorableMoments] = useState(profile?.memorableMoments ?? '');
  const [communicationStyle, setCommunicationStyle] = useState(profile?.communicationStyle ?? '');
  const [personalNotes, setPersonalNotes] = useState(profile?.personalNotes ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await saveDoctorProfile(doctorId, {
        birthDate,
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
      });
      router.back();
    } catch (e) {
      alertError('ذخیره نشد', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'پروفایل شخصی' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <Text variant="tiny" color="textFaint">
          یادداشت خصوصی شماست. برای تبریک تولد، کافی است تاریخ تولد را بنویسید و بعد از ذخیره، مناسبت تولد را اضافه
          کنید.
        </Text>

        <JalaliDateField label="تاریخ تولد" value={birthDate} onChange={setBirthDate} />
        <Input label="زادگاه" value={hometown} onChangeText={setHometown} />
        <Input label="دانشگاه" value={almaMater} onChangeText={setAlmaMater} />
        <Input label="سال فارغ‌التحصیلی" value={graduationYear} onChangeText={setGraduationYear} numericFold />

        <SectionHeader title="شناختن بهتر" />
        <Input label="علایق" value={interests} onChangeText={setInterests} hint="با ویرگول جدا کنید" />
        <Input label="موضوع‌های مورد علاقه" value={favoriteTopics} onChangeText={setFavoriteTopics} multiline />
        <Input label="چیزهایی که خوشش نمی‌آید" value={dislikes} onChangeText={setDislikes} multiline />
        <Input label="خانواده" value={familyNotes} onChangeText={setFamilyNotes} multiline />

        <SectionHeader title="سابقه‌ی آشنایی" />
        <Input label="چطور آشنا شدیم" value={howWeMet} onChangeText={setHowWeMet} multiline />
        <Input label="خاطره‌ها" value={memorableMoments} onChangeText={setMemorableMoments} multiline />
        <Input
          label="سبک ارتباط"
          value={communicationStyle}
          onChangeText={setCommunicationStyle}
          multiline
          placeholder="مثلاً: پیام را بهتر از تماس جواب می‌دهد؛ بعد از ساعت ۲۲ زنگ نزنید."
        />
        <Input label="یادداشت شخصی" value={personalNotes} onChangeText={setPersonalNotes} multiline />

        <Button label="ذخیره" icon="checkmark" onPress={() => void save()} loading={saving} full />
        <Button label="انصراف" variant="ghost" onPress={() => router.back()} full haptic={false} />
      </Column>
    </Screen>
  );
}
