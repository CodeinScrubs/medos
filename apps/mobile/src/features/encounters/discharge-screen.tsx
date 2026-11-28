import { useLocalSearchParams } from 'expo-router';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, Card, ChipSelect, Column, Input, Row, Screen, Text } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import { useNow } from '@/components/use-now';
import type { Encounter } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { formatJalaliDateTime } from '@/lib/jalali';
import { joinLabels } from '@/lib/persian';
import { useTheme } from '@/theme';

import { encounterFormDisplayDate, type DischargeFormFields } from './form-draft';
import { EncounterFormDraftGate } from './form-draft-gate';
import { EncounterFormDraftNotice } from './form-draft-notice';
import { DISCHARGE_TYPE_LABELS } from './labels';
import { dischargeWorkQuery, type DischargeWork } from './queries';
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

const WORK_GROUPS: { kind: DischargeWork['kind']; title: string }[] = [
  { kind: 'task', title: 'کارهای باز می‌مانند' },
  { kind: 'followup', title: 'پیگیری‌های در انتظار باز می‌مانند' },
  { kind: 'consult', title: 'کانسالت‌های بی‌پاسخ باز می‌مانند' },
  { kind: 'order', title: 'این دستورهای کاردکس با بستری پایان می‌یابند' },
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
      {(seed, notice, reset, generation) => (
        <DischargeForm seed={seed} readNotice={notice} onReset={reset} generation={generation} />
      )}
    </EncounterFormDraftGate>
  );
}
function DischargeForm({
  seed,
  generation,
  readNotice,
  onReset,
}: {
  seed: EncounterFormSeed;
  generation: number;
  readNotice: ReactNode;
  onReset: (seed: EncounterFormSeed) => void;
}) {
  const { spacing } = useTheme();
  const now = useNow();
  const editing = useEncounterFormDraft(seed, onReset, generation);
  const { dischargeType, nextStatus, outcomeNotes } = editing.form as DischargeFormFields;
  const change = editing.changeDischarge;
  const saving = editing.busy;
  const locked = saving || !!editing.finishedMessage;
  const patientId = seed.row.patient.id;
  const encounterId = seed.encounterId!;
  const dateValidation = useDateValidation();
  const { data, error, loading, retry } = useLive(dischargeWorkQuery(patientId, encounterId), [patientId, encounterId]);
  const work = error ? undefined : data;
  const shownWork = useRef<DischargeWork[] | undefined>(undefined);
  useLayoutEffect(() => {
    shownWork.current = work;
    return () => {
      shownWork.current = undefined;
    };
  }, [work]);
  return (
    <Screen scroll>
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {readNotice}
        <Text variant="bodyStrong">
          {seed.row.patient.firstName} {seed.row.patient.lastName}
        </Text>
        <EncounterFormDraftNotice editing={editing} seed={seed} />
        <ErrorNotice error={error} what="کارهای باز و اثر ترخیص" onRetry={retry} />
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

        {loading ? <Text variant="caption">در حال بررسی کارهای باز…</Text> : null}
        {work?.length ? (
          <Card tone="alt">
            <Column gap="xs">
              {WORK_GROUPS.map(({ kind, title }) => {
                const items = work.filter((item) => item.kind === kind);
                return items.length ? (
                  <Column key={kind} gap="xxs">
                    <Text variant="captionStrong">{title}</Text>
                    {items.map((item) => (
                      <Consequence key={item.id}>
                        {joinLabels([
                          item.title,
                          item.detail,
                          item.kind === 'order' && item.status === 'held' ? 'متوقف موقت' : null,
                          item.kind === 'consult'
                            ? item.status === 'requested'
                              ? 'درخواست‌شده'
                              : 'در انتظار درخواست'
                            : null,
                          item.dueAt ? formatJalaliDateTime(item.dueAt) : null,
                        ])}
                      </Consequence>
                    ))}
                  </Column>
                ) : null;
              })}
            </Column>
          </Card>
        ) : null}

        <Button
          label="ثبت ترخیص"
          icon="exit-outline"
          onPress={() => {
            if (work && shownWork.current === work && dateValidation.check())
              void editing
                .save(work)
                .then(retry)
                .catch((cause) => alertError('بررسی ترخیص انجام نشد', cause));
          }}
          loading={saving}
          disabled={locked || work === undefined}
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
