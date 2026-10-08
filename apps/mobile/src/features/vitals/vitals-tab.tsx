import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';

import { useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { EditGate } from '@/components/edit-gate';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { TrendChart } from '@/components/trend-chart';
import { Button, Card, ChipSelect, Column, EmptyState, Row, SectionHeader, Text } from '@/components/ui';
import { useNow } from '@/components/use-now';
import { useLive } from '@/db/use-live';
import { withDatasetWrite } from '@/lib/dataset-write';
import type { BloodSugarUnit } from '@/lib/glucose-unit';
import { formatJalali, formatJalaliDateTime } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { decodeVitalForm } from './form-draft';
import { patientVitalDraftsQuery, vitalFormQuery, type VitalFormRow } from './form-draft-queries';
import { vitalChips } from './logic';
import { deleteVital, patientVitalsQuery, vitalSeries, type VitalSeriesKey } from './queries';
import { VitalForm } from './vital-form';

type ChartKey = Exclude<VitalSeriesKey, 'bloodSugar'> | 'glucose-mgdl' | 'glucose-mmol';
const SERIES: { value: ChartKey; key: VitalSeriesKey; unit?: BloodSugarUnit; label: string }[] = [
  { value: 'systolic', key: 'systolic', label: 'فشار سیستول' },
  { value: 'diastolic', key: 'diastolic', label: 'فشار دیاستول' },
  { value: 'heartRate', key: 'heartRate', label: 'نبض' },
  { value: 'temperature', key: 'temperature', label: 'دما' },
  { value: 'spo2', key: 'spo2', label: 'اشباع اکسیژن' },
  { value: 'respRate', key: 'respRate', label: 'تنفس' },
  { value: 'glucose-mgdl', key: 'bloodSugar', unit: 'mg/dL', label: 'قند mg/dL' },
  { value: 'glucose-mmol', key: 'bloodSugar', unit: 'mmol/L', label: 'قند mmol/L' },
];

/** Raw input is independent of clinical readings; switching editors never silently discards it. */
export function VitalsTab({ patientId }: { patientId: string }) {
  const { generation, stale } = useDatasetIntent();
  const scope = useAutosaveScope();
  const { spacing } = useTheme();
  const now = useNow();
  const { data, error, retry } = useLive(patientVitalsQuery(patientId), [patientId]);
  const drafts = useLive(patientVitalDraftsQuery(patientId), [patientId]);
  const rows = data ?? [];
  const [seed, setSeed] = useState<{ key: number; row: VitalFormRow } | null>(null);
  const sequence = useRef(0);
  const [opening, setOpening] = useState(false);
  const starting = useRef(false);
  const [readError, setReadError] = useState<Error>();
  const lastRequested = useRef<string | null>(null);
  const [series, setSeries] = useState<ChartKey>('systolic');

  async function begin(vitalId: string | null) {
    if (starting.current) return;
    starting.current = true;
    setOpening(true);
    lastRequested.current = vitalId;
    try {
      await withDatasetWrite(generation, async () => {
        if (scope && !(await scope.canLeave())) throw new Error('پیش‌نویس ذخیره نشد؛ نوشتهٔ این فرم نگه داشته شد.');
        const row = (await vitalFormQuery(patientId, vitalId))[0];
        if (!row) throw new Error('اندازه‌گیری یا بیمار در دسترس نیست.');
        setSeed({ key: ++sequence.current, row });
        setReadError(undefined);
      });
    } catch (e) {
      setReadError(e as Error);
      alertError('فرم باز نشد', e);
    } finally {
      starting.current = false;
      setOpening(false);
    }
  }
  let malformed: Error | undefined;
  try {
    if (seed?.row.draft) decodeVitalForm(seed.row.draft.body);
  } catch (e) {
    malformed = e as Error;
  }
  const availableSeries = SERIES.filter((s) => vitalSeries(rows, s.key, s.unit).length > 1);
  const selectedSeries = availableSeries.find((s) => s.value === series) ?? availableSeries[0];
  const points = selectedSeries ? vitalSeries(rows, selectedSeries.key, selectedSeries.unit) : [];
  const pendingNew = drafts.data?.some((row) => row.vitalId === null);

  return (
    <Column gap="md" style={{ paddingTop: spacing.md }}>
      <ErrorNotice error={error} what="علائم حیاتی" onRetry={retry} />
      <ErrorNotice error={drafts.error} what="پیش‌نویس اندازه‌گیری" onRetry={drafts.retry} />
      <ErrorNotice error={readError} what="فرم اندازه‌گیری" onRetry={() => void begin(lastRequested.current)} />
      {seed ? (
        malformed ? (
          <Card>
            <Column gap="sm">
              <ErrorNotice error={malformed} what="پیش‌نویس اندازه‌گیری" />
              <Text selectable>{seed.row.draft?.body}</Text>
              <Button label="بستن" variant="ghost" onPress={() => setSeed(null)} />
            </Column>
          </Card>
        ) : (
          <EditGate
            key={seed.key}
            editing
            rows={[seed.row]}
            error={undefined}
            onRetry={retry}
            what="اندازه‌گیری"
            fenceDataset
          >
            {(row, notice) =>
              row ? (
                <>
                  {notice}
                  <VitalForm
                    seed={row}
                    switching={opening}
                    isSwitching={() => starting.current}
                    onClose={() => {
                      if (sequence.current === seed.key) setSeed(null);
                    }}
                    onReset={(next) => {
                      if (sequence.current === seed.key) setSeed({ key: ++sequence.current, row: next });
                    }}
                  />
                </>
              ) : null
            }
          </EditGate>
        )
      ) : (
        <Column gap="sm">
          <Button
            label={pendingNew ? 'ادامهٔ اندازه‌گیری' : 'اندازه‌گیری تازه'}
            icon="add"
            variant="secondary"
            onPress={() => void begin(null)}
            disabled={opening || stale}
            loading={opening}
            full
          />
          {(drafts.data ?? [])
            .filter((draft) => draft.vitalId !== null)
            .map((draft) => (
              <Button
                key={draft.id}
                label={`پیش‌نویس اندازه‌گیری · ${formatJalaliDateTime(draft.updatedAt)}`}
                variant="ghost"
                disabled={opening || stale}
                onPress={() => void begin(draft.vitalId)}
              />
            ))}
        </Column>
      )}
      {rows.length === 0 && data !== undefined && !error ? (
        <EmptyState
          icon="pulse-outline"
          title="هنوز اندازه‌گیری‌ای ثبت نشده"
          description="هر اندازه‌گیری که گرفته نشده خالی می‌ماند."
        />
      ) : null}
      {points.length > 1 ? (
        <Column gap="sm">
          <SectionHeader title="نمودار" />
          <ChipSelect
            options={availableSeries}
            value={selectedSeries?.value}
            onChange={(value) => value && setSeries(value)}
          />
          <Card>
            <TrendChart points={points} formatDate={formatJalali} height={180} />
          </Card>
        </Column>
      ) : null}
      {rows.length > 0 ? (
        <>
          <SectionHeader title="اندازه‌گیری‌ها" count={data !== undefined && !error ? rows.length : undefined} />
          <Column gap="sm">
            {rows.map((row) => (
              <Pressable
                key={row.id}
                disabled={opening || stale}
                onPress={() => void begin(row.id)}
                onLongPress={() =>
                  Alert.alert('حذف این اندازه‌گیری؟', formatJalaliDateTime(row.measuredAt), [
                    { text: 'انصراف', style: 'cancel' },
                    {
                      text: 'حذف',
                      style: 'destructive',
                      onPress: () =>
                        void withDatasetWrite(generation, () => deleteVital(row.id, new Date(now))).catch((e) =>
                          alertError('حذف نشد', e),
                        ),
                    },
                  ])
                }
              >
                <Card>
                  <Column gap="xs">
                    <Text variant="tiny" color="textFaint">
                      {formatJalaliDateTime(row.measuredAt)}
                    </Text>
                    <Row gap="xs" wrap>
                      {vitalChips(row).map((chip) => (
                        <Row key={chip.key} gap="xxs" align="baseline">
                          <Text variant="tiny" color="textFaint">
                            {chip.label}
                          </Text>
                          <Text numeric variant="bodyStrong" style={styles.ltr}>
                            {chip.value}
                          </Text>
                        </Row>
                      ))}
                    </Row>
                    {row.notes ? (
                      <Text variant="caption" color="textMuted">
                        {row.notes}
                      </Text>
                    ) : null}
                  </Column>
                </Card>
              </Pressable>
            ))}
          </Column>
          <Text variant="tiny" color="textFaint">
            ویرایش: لمس · حذف: نگه‌داشتن
          </Text>
        </>
      ) : null}
    </Column>
  );
}
const styles = StyleSheet.create({ ltr: { writingDirection: 'ltr' } });
