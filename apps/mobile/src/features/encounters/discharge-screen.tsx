import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { alertError } from '@/components/feedback';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, Card, ChipSelect, Column, Input, Screen, Text } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import type { Encounter, PatientStatus } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { patientConsultsQuery } from '@/features/consults/queries';
import { dischargeEncounter } from '@/features/encounters/queries';
import { patientOrdersQuery } from '@/features/kardex/queries';
import { taskCountQuery } from '@/features/tasks/queries';
import { toPersianDigits } from '@/lib/persian';
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
  const { id: patientId, encounterId } = useLocalSearchParams<{ id: string; encounterId: string }>();
  const router = useRouter();
  const { spacing } = useTheme();

  // What the discharge will do, and what it leaves open, said before it happens.
  const { data: orders } = useLive(patientOrdersQuery(patientId, encounterId), [patientId, encounterId]);
  const { data: openTasks } = useLive(taskCountQuery({ patientId, status: 'open' }), [patientId]);
  const { data: consults } = useLive(patientConsultsQuery(patientId), [patientId]);
  const endingOrders = (orders ?? []).filter(
    (o) => o.encounterId === encounterId && (o.status === 'active' || o.status === 'held'),
  ).length;
  const stillOpenTasks = openTasks?.[0]?.total ?? 0;
  const stillOpenConsults = (consults ?? []).filter(
    ({ consult }) => consult.status === 'pending' || consult.status === 'requested',
  ).length;

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
            hint="«ادامه‌ی پیگیری» بیمار را در فهرست «جاری» بیماران نگه می‌دارد. برای یادآور در «امروز»، بعد از ترخیص یک پیگیری با تاریخ ثبت کنید."
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

        {endingOrders + stillOpenTasks + stillOpenConsults > 0 ? (
          <Card tone="alt">
            <Column gap="xxs">
              <Text variant="captionStrong">با ثبت ترخیص</Text>
              {endingOrders > 0 ? (
                <Text variant="caption">
                  • {toPersianDigits(endingOrders)} دستور کاردکسِ این بستری «تمام‌شده» می‌شود.
                </Text>
              ) : null}
              {stillOpenTasks > 0 ? (
                <Text variant="caption">• {toPersianDigits(stillOpenTasks)} کار باز همچنان باز می‌ماند.</Text>
              ) : null}
              {stillOpenConsults > 0 ? (
                <Text variant="caption">
                  • {toPersianDigits(stillOpenConsults)} کانسالت بی‌پاسخ همچنان باز می‌ماند.
                </Text>
              ) : null}
            </Column>
          </Card>
        ) : null}

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
