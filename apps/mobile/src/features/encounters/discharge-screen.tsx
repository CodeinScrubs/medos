import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { alertError } from '@/components/feedback';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, ChipSelect, Column, Input, Screen, Text } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import type { Encounter, PatientStatus } from '@/db/schema';
import { dischargeEncounter } from '@/features/encounters/queries';
import { useTheme } from '@/theme';

import { DISCHARGE_TYPE_LABELS } from './labels';

type DischargeType = NonNullable<Encounter['dischargeType']>;

const TYPE_OPTIONS = (Object.keys(DISCHARGE_TYPE_LABELS) as DischargeType[]).map((k) => ({
  value: k,
  label: DISCHARGE_TYPE_LABELS[k],
}));

const NEXT_STATUS_OPTIONS: { value: PatientStatus; label: string }[] = [
  { value: 'discharged', label: 'ترخیص‌شده' },
  { value: 'followup', label: 'ادامه‌ی پیگیری' },
  { value: 'outpatient', label: 'سرپایی' },
];

/** Close an admission. Route params: `id` (patient), `encounterId`. */
export function DischargeScreen() {
  const { encounterId } = useLocalSearchParams<{ id: string; encounterId: string }>();
  const router = useRouter();
  const { spacing } = useTheme();

  const [dischargeType, setDischargeType] = useState<DischargeType>('improved');
  const [nextStatus, setNextStatus] = useState<PatientStatus>('discharged');
  const [dischargedAt, setDischargedAt] = useState(() => new Date());
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const dateValidation = useDateValidation();

  async function save() {
    if (!dateValidation.check()) return;
    setSaving(true);
    try {
      await dischargeEncounter(encounterId, {
        dischargedAt,
        dischargeType,
        outcomeNotes: outcomeNotes.trim() || null,
        nextStatus,
      });
      router.back();
    } catch (e) {
      alertError('ثبت نشد', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <ChipSelect
          label="نوع ترخیص"
          options={TYPE_OPTIONS}
          value={dischargeType}
          onChange={(v) => v && setDischargeType(v)}
          layout="wrap"
        />

        {dischargeType !== 'death' && (
          <ChipSelect
            label="وضعیت بیمار بعد از ترخیص"
            options={NEXT_STATUS_OPTIONS}
            value={nextStatus}
            onChange={(v) => v && setNextStatus(v)}
            hint="«ادامه‌ی پیگیری» بیمار را در صفحه‌ی امروز نگه می‌دارد"
          />
        )}

        <QuickDateField
          onValidityChange={dateValidation.setValid}
          label="تاریخ ترخیص"
          value={dischargedAt}
          onChange={setDischargedAt}
          direction="past"
          withTime
        />

        <Input
          label="خلاصه‌ی نتیجه"
          value={outcomeNotes}
          onChangeText={setOutcomeNotes}
          placeholder="تشخیص نهایی، داروهای ترخیص، توصیه‌ها"
          multiline
        />

        <Text variant="tiny" color="textFaint">
          برای خلاصه‌ی ترخیص کامل، بعد از ثبت یک نوت از نوع «خلاصه ترخیص» بنویسید.
        </Text>

        <Button
          label="ثبت ترخیص"
          icon="exit-outline"
          onPress={() => void save()}
          loading={saving}
          full
          style={{ marginTop: spacing.sm }}
        />
        <Button label="انصراف" variant="ghost" onPress={() => router.back()} full haptic={false} />
      </Column>
    </Screen>
  );
}
