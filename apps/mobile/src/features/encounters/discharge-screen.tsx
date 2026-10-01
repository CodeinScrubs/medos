import { useLocalSearchParams } from 'expo-router';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, Card, ChipSelect, Column, Input, Row, Screen, Text } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import { useNow } from '@/components/use-now';
import type { Encounter } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { patientConsultsQuery } from '@/features/consults/queries';
import { patientOrdersQuery } from '@/features/kardex/queries';
import { taskCountQuery } from '@/features/tasks/queries';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { encounterFormDisplayDate, type DischargeFormFields } from './form-draft';
import { EncounterFormDraftGate } from './form-draft-gate';
import { EncounterFormDraftNotice } from './form-draft-notice';
import { DISCHARGE_TYPE_LABELS } from './labels';
import { useEncounterFormDraft, type EncounterFormSeed } from './use-form-draft';

type DischargeType = NonNullable<Encounter['dischargeType']>;

const TYPE_OPTIONS = (Object.keys(DISCHARGE_TYPE_LABELS) as DischargeType[]).map((k) => ({
  value: k,
  label: DISCHARGE_TYPE_LABELS[k],
}));

const NEXT_STATUS_OPTIONS: { value: DischargeFormFields['nextStatus']; label: string }[] = [
  { value: 'discharged', label: 'ترخیص‌شده' },
  { value: 'followup', label: 'ادامه‌ی پیگیری' },
  { value: 'outpatient', label: 'سرپایی' },
];

/** Close an admission. Route params: `id` (patient), `encounterId`. */
export function DischargeScreen() {
  const { id: patientId, encounterId } = useLocalSearchParams<{ id: string; encounterId: string }>();
  return (
    <EncounterFormDraftGate
      key={patientId + ':' + encounterId}
      mode="discharge"
      patientId={patientId}
      encounterId={encounterId}
    >
      {(seed, notice, reset) => <DischargeForm seed={seed} readNotice={notice} onReset={reset} />}
    </EncounterFormDraftGate>
  );
}
function DischargeForm({
  seed,
  readNotice,
  onReset,
}: {
  seed: EncounterFormSeed;
  readNotice: ReactNode;
  onReset: (seed: EncounterFormSeed) => void;
}) {
  const { spacing } = useTheme();
  const now = useNow();
  const editing = useEncounterFormDraft(seed, onReset);
  const { dischargeType, nextStatus, outcomeNotes } = editing.form as DischargeFormFields;
  const change = editing.changeDischarge;
  const saving = editing.busy;
  const locked = saving || !!editing.finishedMessage;
  const patientId = seed.row.patient.id;
  const encounterId = seed.encounterId!;
  const dateValidation = useDateValidation();
  // What the discharge will do, and what it leaves open, said before it happens.
  const {
    data: orders,
    error: orderError,
    retry: retryOrders,
  } = useLive(patientOrdersQuery(patientId, encounterId), [patientId, encounterId]);
  const {
    data: openTasks,
    error: taskError,
    retry: retryTasks,
  } = useLive(taskCountQuery({ patientId, status: 'open' }), [patientId]);
  const {
    data: consults,
    error: consultError,
    retry: retryConsults,
  } = useLive(patientConsultsQuery(patientId), [patientId]);
  const endingOrders =
    !orderError && orders
      ? orders.filter((o) => o.encounterId === encounterId && (o.status === 'active' || o.status === 'held')).length
      : 0;
  const stillOpenTasks = !taskError ? (openTasks?.[0]?.total ?? 0) : 0;
  const stillOpenConsults =
    !consultError && consults
      ? consults.filter(({ consult }) => consult.status === 'pending' || consult.status === 'requested').length
      : 0;

  return (
    <Screen scroll>
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {readNotice}
        <Text variant="bodyStrong">
          {seed.row.patient.firstName} {seed.row.patient.lastName}
        </Text>
        <EncounterFormDraftNotice editing={editing} seed={seed} />
        <ErrorNotice error={orderError} what="کاردکس" onRetry={retryOrders} />
        <ErrorNotice error={taskError} what="کارهای باز" onRetry={retryTasks} />
        <ErrorNotice error={consultError} what="کانسالت‌ها" onRetry={retryConsults} />
        <ChipSelect
          label="نوع ترخیص"
          options={TYPE_OPTIONS}
          value={dischargeType}
          onChange={(v) => v && change({ dischargeType: v })}
          layout="wrap"
        />

        {dischargeType !== 'death' && (
          <ChipSelect
            label="وضعیت بیمار بعد از ترخیص"
            options={NEXT_STATUS_OPTIONS}
            value={nextStatus}
            onChange={(v) => v && change({ nextStatus: v })}
            hint="«ادامهٔ پیگیری» بیمار را در فهرست جاری نگه می‌دارد."
          />
        )}

        <QuickDateField
          onValidityChange={dateValidation.setValid}
          label="تاریخ ترخیص"
          value={encounterFormDisplayDate(editing.document, new Date(now))}
          rawInput={editing.document.fields.date}
          onRawInputChange={editing.changeDate}
          disabled={locked}
          direction="past"
          withTime
        />

        <Input
          label="خلاصه‌ی نتیجه"
          value={outcomeNotes}
          onChangeText={(outcomeNotes) => change({ outcomeNotes })}
          editable={!locked}
          placeholder="تشخیص نهایی، داروهای ترخیص، توصیه‌ها"
          multiline
        />

        {endingOrders + stillOpenTasks + stillOpenConsults > 0 ? (
          <Card tone="alt">
            <Column gap="xs">
              <Text variant="captionStrong">با ثبت ترخیص</Text>
              {endingOrders > 0 ? (
                <Consequence>{toPersianDigits(endingOrders)} دستور کاردکسِ این بستری «تمام‌شده» می‌شود.</Consequence>
              ) : null}
              {stillOpenTasks > 0 ? (
                <Consequence>{toPersianDigits(stillOpenTasks)} کار باز همچنان باز می‌ماند.</Consequence>
              ) : null}
              {stillOpenConsults > 0 ? (
                <Consequence>{toPersianDigits(stillOpenConsults)} کانسالت بی‌پاسخ همچنان باز می‌ماند.</Consequence>
              ) : null}
            </Column>
          </Card>
        ) : null}

        <Button
          label="ثبت ترخیص"
          icon="exit-outline"
          onPress={() => {
            if (dateValidation.check()) void editing.save();
          }}
          loading={saving}
          disabled={!!editing.finishedMessage}
          full
          style={{ marginTop: spacing.sm }}
        />
        {editing.hasDraft && !editing.finishedMessage ? (
          <Button label="حذف پیش‌نویس" variant="ghost" full disabled={saving} onPress={editing.discard} />
        ) : null}
        <Button label="بستن" variant="ghost" onPress={editing.close} disabled={saving} full haptic={false} />
      </Column>
    </Screen>
  );
}

/**
 * One line of the list, with its marker drawn rather than typed: a "•" next to
 * a Persian digit reads as a zero, and "• ۱ دستور" looked like ten orders.
 */
function Consequence({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Row gap="sm" align="center">
      <View style={[styles.marker, { backgroundColor: colors.textMuted }]} />
      <Text variant="caption" style={styles.grow}>
        {children}
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  marker: { width: 6, height: 6, borderRadius: 3 },
});
