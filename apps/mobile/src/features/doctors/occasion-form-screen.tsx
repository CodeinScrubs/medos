import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { EditGate } from '@/components/edit-gate';
import { alertError } from '@/components/feedback';
import { JalaliDateField } from '@/components/jalali-date-field';
import { Button, ChipSelect, Column, Input, Screen, Text, Toggle } from '@/components/ui';
import type { Occasion } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { formatJalaliLong, fromJalali, toIsoDate, toJalali } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { OCCASION_KIND_LABELS } from './labels';
import { DEFAULT_GREETING, occasionNextDate, occasionReminderAt } from './logic';
import { createOccasion, occasionQuery, updateOccasion } from './occasions-queries';
import { doctorProfileQuery } from './ratings-queries';

const KIND_OPTIONS = (Object.keys(OCCASION_KIND_LABELS) as Occasion['kind'][]).map((k) => ({
  value: k,
  label: OCCASION_KIND_LABELS[k],
}));

const LEAD_OPTIONS = [
  { value: '0', label: 'همان روز' },
  { value: '1', label: 'یک روز قبل' },
  { value: '3', label: 'سه روز قبل' },
  { value: '7', label: 'یک هفته قبل' },
];

/**
 * A date worth a message: a birthday, a graduation, anything recurring.
 *
 * A recurring occasion is stored as a Jalali month and day, not a date. A
 * Persian birthday recurs on the Persian calendar, and converting a stored
 * Gregorian date back every year drifts across leap years — the one place in
 * MedOS where a Jalali value is what gets saved.
 *
 * Params: `doctorId`, and `occasionId` when editing.
 */
export function OccasionFormScreen() {
  const { doctorId, occasionId } = useLocalSearchParams<{ doctorId: string; occasionId?: string }>();
  const { data } = useLive(occasionQuery(occasionId ?? ''), [occasionId]);
  return (
    <EditGate editing={Boolean(occasionId)} rows={data}>
      {(occasion) => <OccasionForm doctorId={doctorId} occasion={occasion} />}
    </EditGate>
  );
}

function OccasionForm({ doctorId, occasion }: { doctorId: string; occasion: Occasion | null }) {
  const router = useRouter();
  const { spacing } = useTheme();

  const { data: profileRows } = useLive(doctorProfileQuery(doctorId ?? ''), [doctorId]);
  const knownBirthDate = profileRows?.[0]?.birthDate ?? null;

  const [kind, setKind] = useState<Occasion['kind']>(occasion?.kind ?? 'birthday');
  const [title, setTitle] = useState(occasion?.title ?? '');
  const [isRecurring, setIsRecurring] = useState(occasion?.isRecurring ?? true);
  const [isEnabled, setIsEnabled] = useState(occasion?.isEnabled ?? true);
  const [remindDaysBefore, setRemindDaysBefore] = useState(String(occasion?.remindDaysBefore ?? 1));
  const [messageTemplate, setMessageTemplate] = useState(occasion?.messageTemplate ?? '');
  const [saving, setSaving] = useState(false);

  /*
   * Both shapes of date are edited as one Jalali field. For a recurring
   * occasion only the month and day are kept, so the year the user types is
   * irrelevant — the birthday's own year is the natural thing to type, and
   * the profile's birth date pre-fills it.
   */
  const [dateIso, setDateIso] = useState<string | null>(() => {
    if (occasion?.onDate) return occasion.onDate;
    if (occasion?.jalaliMonth && occasion.jalaliDay) {
      const { jy } = toJalali(new Date());
      return toIsoDate(fromJalali(jy, occasion.jalaliMonth, occasion.jalaliDay));
    }
    return knownBirthDate;
  });

  const jalali = dateIso ? toJalali(new Date(`${dateIso}T00:00:00`)) : null;
  const preview = jalali
    ? {
        jalaliMonth: jalali.jm,
        jalaliDay: jalali.jd,
        onDate: dateIso,
        isRecurring,
        remindDaysBefore: Number(remindDaysBefore),
        isEnabled,
      }
    : null;
  const nextAt = preview ? occasionNextDate(preview) : null;
  const remindAt = preview ? occasionReminderAt(preview) : null;

  async function save() {
    if (!dateIso || !jalali) {
      Alert.alert('تاریخ لازم است', 'تاریخ مناسبت را بنویسید.');
      return;
    }
    setSaving(true);
    const payload = {
      doctorId,
      kind,
      title: title.trim() || OCCASION_KIND_LABELS[kind],
      jalaliMonth: isRecurring ? jalali.jm : null,
      jalaliDay: isRecurring ? jalali.jd : null,
      onDate: isRecurring ? null : dateIso,
      isRecurring,
      remindDaysBefore: Number(remindDaysBefore),
      messageTemplate: messageTemplate.trim() || null,
      isEnabled,
    };
    try {
      if (occasion) await updateOccasion(occasion.id, payload);
      else await createOccasion(payload);
      router.back();
    } catch (e) {
      alertError('ذخیره نشد', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: occasion ? 'ویرایش مناسبت' : 'مناسبت جدید' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <ChipSelect label="نوع" options={KIND_OPTIONS} value={kind} onChange={(v) => v && setKind(v)} />
        <Input
          label="عنوان"
          value={title}
          onChangeText={setTitle}
          placeholder={OCCASION_KIND_LABELS[kind]}
          hint="خالی بگذارید تا همان نوع نوشته شود"
        />

        <JalaliDateField
          label="تاریخ"
          value={dateIso}
          onChange={setDateIso}
          allowFuture
          hint={isRecurring ? 'فقط ماه و روزش نگه داشته می‌شود؛ سال مهم نیست.' : undefined}
        />
        <Toggle
          label="هر سال تکرار شود"
          description="تولد و سالگرد بله؛ یک مناسبت یک‌باره خیر"
          value={isRecurring}
          onChange={setIsRecurring}
        />

        <ChipSelect
          label="یادآوری"
          options={LEAD_OPTIONS}
          value={remindDaysBefore}
          onChange={(v) => v && setRemindDaysBefore(v)}
        />
        <Toggle label="یادآور روشن" value={isEnabled} onChange={setIsEnabled} />

        {nextAt ? (
          <Text variant="caption" color="textMuted">
            نوبت بعدی: {formatJalaliLong(nextAt)}
            {remindAt ? ` — یادآوری ${formatJalaliLong(remindAt)} ساعت ۹ صبح` : ' — بدون یادآور'}
          </Text>
        ) : null}

        <Input
          label="متن آماده‌ی تبریک"
          value={messageTemplate}
          onChangeText={setMessageTemplate}
          multiline
          placeholder={DEFAULT_GREETING[kind]}
          hint="می‌توانید {نام} و {مناسبت} بنویسید تا خودکار پر شوند. خالی بگذارید تا متن پیش‌فرض استفاده شود."
        />
        <Text variant="tiny" color="textFaint">
          MedOS خودش پیامی نمی‌فرستد. سر موعد نوتیفیکیشن می‌دهد و متن را آماده می‌کند؛ فرستادن با خودتان است.
        </Text>

        <Button
          label={occasion ? 'ذخیره' : 'افزودن مناسبت'}
          icon="checkmark"
          onPress={() => void save()}
          loading={saving}
          full
        />
        <Button label="انصراف" variant="ghost" onPress={() => router.back()} full haptic={false} />
      </Column>
    </Screen>
  );
}
