import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { alertError, notify } from '@/components/feedback';
import { QuickDateField } from '@/components/quick-date-field';
import { TrendChart } from '@/components/trend-chart';
import { Button, Card, ChipSelect, Column, EmptyState, Input, Row, SectionHeader, Text } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import { useNow } from '@/components/use-now';
import type { Vital } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { withDatasetWrite } from '@/lib/dataset-write';
import { formatJalali, formatJalaliDateTime } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { hasAnyVital, parseVitalForm, vitalChips, vitalEditPatch, vitalFormOf, type VitalForm } from './logic';
import { deleteVital, patientVitalsQuery, recordVital, updateVital, vitalSeries, type VitalSeriesKey } from './queries';

const SERIES: { value: VitalSeriesKey; label: string }[] = [
  { value: 'systolic', label: 'فشار سیستول' },
  { value: 'diastolic', label: 'فشار دیاستول' },
  { value: 'heartRate', label: 'نبض' },
  { value: 'temperature', label: 'دما' },
  { value: 'spo2', label: 'اشباع اکسیژن' },
  { value: 'respRate', label: 'تنفس' },
  { value: 'bloodSugar', label: 'قند' },
];

const EMPTY: VitalForm = {
  bp: '',
  heartRate: '',
  respRate: '',
  temperature: '',
  spo2: '',
  bloodSugar: '',
  weightKg: '',
  heightCm: '',
  painScore: '',
  urineOutput: '',
  notes: '',
};

/**
 * Observations: take a set, and see the ones already taken.
 *
 * Blood pressure is one field because that is how it is written and said;
 * two boxes side by side are two chances to put a number in the wrong one.
 * Everything else is optional and stays empty when it was not measured — a
 * blank is "not taken", which is a different fact from a number.
 *
 * Nothing here calls a value abnormal. MedOS records; a colour that says
 * "this is low" is the app having an opinion about a patient it cannot see,
 * and the person reading it already knows.
 */
export function VitalsTab({ patientId }: { patientId: string }) {
  const { generation } = useDatasetIntent();
  const { colors, spacing } = useTheme();
  const now = useNow();
  const { data, error, retry } = useLive(patientVitalsQuery(patientId), [patientId]);
  const rows = data ?? [];

  const [form, setForm] = useState<VitalForm>(EMPTY);
  const latestForm = useRef(form);
  const [editing, setEditing] = useState<Vital | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const dateValidation = useDateValidation();
  const [errors, setErrors] = useState<Partial<Record<keyof VitalForm, string>>>({});
  const [measuredAt, setMeasuredAt] = useState(() => new Date(now));
  const latestDate = useRef(measuredAt);
  const [series, setSeries] = useState<VitalSeriesKey>('systolic');

  function replaceForm(value: VitalForm) {
    latestForm.current = value;
    setForm(value);
  }
  function set(key: keyof VitalForm, value: string) {
    if (!submitting.current) replaceForm({ ...latestForm.current, [key]: value });
  }
  function setDate(value: Date) {
    if (submitting.current) return;
    latestDate.current = value;
    setMeasuredAt(value);
  }

  function startNew() {
    if (submitting.current) return;
    replaceForm(EMPTY);
    setErrors({});
    setDate(new Date(now));
    setEditing(null);
    setOpen(true);
  }

  function startEdit(id: string) {
    if (submitting.current) return;
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    setErrors({});
    setDate(row.measuredAt);
    replaceForm(vitalFormOf(row));
    setEditing(row);
    setOpen(true);
  }

  async function save() {
    if (submitting.current) return;
    if (!dateValidation.check()) return;
    const raw = latestForm.current;
    const parsed = parseVitalForm(raw);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    const values = { ...parsed.values, measuredAt: latestDate.current };

    if (!hasAnyVital(values)) {
      notify('چیزی ثبت نشده', 'حداقل یک اندازه‌گیری بنویسید.');
      return;
    }

    submitting.current = true;
    setBusy(true);
    try {
      await withDatasetWrite(generation, async () => {
        if (editing) await updateVital(editing.id, vitalEditPatch(editing, raw, values), new Date(now), editing);
        else await recordVital({ patientId, ...values }, new Date(now));
      });
      replaceForm(EMPTY);
      setEditing(null);
      setOpen(false);
    } catch (e) {
      alertError('ثبت نشد', e);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const availableSeries = SERIES.filter((s) => vitalSeries(rows, s.value).length > 1);
  const selectedSeries = availableSeries.find((s) => s.value === series)?.value ?? availableSeries[0]?.value ?? series;
  const points = vitalSeries(rows, selectedSeries);

  return (
    <Column gap="md" style={{ paddingTop: spacing.md }}>
      <ErrorNotice error={error} what="علائم حیاتی" onRetry={retry} />

      {open ? (
        <Card tone="alt">
          <Column gap="sm">
            <QuickDateField
              onValidityChange={dateValidation.setValid}
              label="زمان اندازه‌گیری"
              value={measuredAt}
              onChange={setDate}
              disabled={busy}
              direction="past"
              withTime
            />
            <Text variant="captionStrong">{editing ? 'اصلاح اندازه‌گیری' : 'اندازه‌گیری تازه'}</Text>

            <Row gap="sm">
              <View style={styles.grow}>
                <Input
                  label="فشار (mmHg)"
                  error={errors.bp}
                  value={form.bp}
                  editable={!busy}
                  onChangeText={(v) => set('bp', v)}
                  placeholder="120/80"
                  ltr
                />
              </View>
              <View style={styles.grow}>
                <Input
                  label="نبض"
                  error={errors.heartRate}
                  value={form.heartRate}
                  editable={!busy}
                  onChangeText={(v) => set('heartRate', v)}
                  keyboardType="numeric"
                  numericFold
                  ltr
                />
              </View>
            </Row>

            <Row gap="sm">
              <View style={styles.grow}>
                <Input
                  label="دما (°C)"
                  error={errors.temperature}
                  value={form.temperature}
                  editable={!busy}
                  onChangeText={(v) => set('temperature', v)}
                  keyboardType="numeric"
                  numericFold
                  ltr
                />
              </View>
              <View style={styles.grow}>
                <Input
                  label="اشباع اکسیژن"
                  error={errors.spo2}
                  value={form.spo2}
                  editable={!busy}
                  onChangeText={(v) => set('spo2', v)}
                  keyboardType="numeric"
                  numericFold
                  ltr
                />
              </View>
              <View style={styles.grow}>
                <Input
                  label="تنفس"
                  error={errors.respRate}
                  value={form.respRate}
                  editable={!busy}
                  onChangeText={(v) => set('respRate', v)}
                  keyboardType="numeric"
                  numericFold
                  ltr
                />
              </View>
            </Row>

            <Row gap="sm">
              <View style={styles.grow}>
                <Input
                  label="قند"
                  error={errors.bloodSugar}
                  value={form.bloodSugar}
                  editable={!busy}
                  onChangeText={(v) => set('bloodSugar', v)}
                  keyboardType="numeric"
                  numericFold
                  ltr
                />
              </View>
              <View style={styles.grow}>
                <Input
                  label="وزن (kg)"
                  error={errors.weightKg}
                  value={form.weightKg}
                  editable={!busy}
                  onChangeText={(v) => set('weightKg', v)}
                  keyboardType="numeric"
                  numericFold
                  ltr
                />
              </View>
              <View style={styles.grow}>
                <Input
                  label="قد (cm)"
                  error={errors.heightCm}
                  value={form.heightCm}
                  editable={!busy}
                  onChangeText={(v) => set('heightCm', v)}
                  keyboardType="numeric"
                  numericFold
                  ltr
                />
              </View>
            </Row>

            <Row gap="sm">
              <View style={styles.grow}>
                <Input
                  label="درد (0 تا 10)"
                  error={errors.painScore}
                  value={form.painScore}
                  editable={!busy}
                  onChangeText={(v) => set('painScore', v)}
                  keyboardType="numeric"
                  numericFold
                  ltr
                />
              </View>
              <View style={styles.grow}>
                <Input
                  label="ادرار"
                  value={form.urineOutput}
                  editable={!busy}
                  onChangeText={(v) => set('urineOutput', v)}
                  placeholder="مثلاً 1200 mL/24h"
                  ltr
                />
              </View>
            </Row>

            <Input label="توضیح" value={form.notes} editable={!busy} onChangeText={(v) => set('notes', v)} multiline />

            <Row gap="sm">
              <Button label="ثبت" icon="checkmark" onPress={() => void save()} loading={busy} />
              <Button
                label="انصراف"
                disabled={busy}
                variant="ghost"
                haptic={false}
                onPress={() => {
                  if (submitting.current) return;
                  setOpen(false);
                  setEditing(null);
                }}
              />
            </Row>
          </Column>
        </Card>
      ) : (
        <Button label="اندازه‌گیری تازه" icon="add" variant="secondary" onPress={startNew} full />
      )}

      {rows.length === 0 && data !== undefined && !error ? (
        <EmptyState
          icon="pulse-outline"
          title="هنوز اندازه‌گیری‌ای ثبت نشده"
          description="فشار، نبض، دما و هرچه گرفته شده — هرکدام که اندازه گرفته نشده خالی می‌ماند."
        />
      ) : null}

      {points.length > 1 ? (
        <Column gap="sm">
          <SectionHeader title="نمودار" />
          <ChipSelect options={availableSeries} value={selectedSeries} onChange={(v) => v && setSeries(v)} />
          <Card>
            <TrendChart points={points} formatDate={formatJalali} height={180} />
          </Card>
        </Column>
      ) : null}

      {rows.length > 0 ? (
        <>
          <SectionHeader title="اندازه‌گیری‌ها" count={data !== undefined && !error ? rows.length : undefined} />
          <Column gap="sm">
            {rows.map((row) => {
              const chips = vitalChips(row);
              return (
                <Pressable
                  key={row.id}
                  disabled={busy}
                  onPress={() => startEdit(row.id)}
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
                      <Row justify="space-between" gap="sm">
                        <Text variant="tiny" color="textFaint">
                          {formatJalaliDateTime(row.measuredAt)}
                        </Text>
                      </Row>
                      <Row gap="xs" wrap>
                        {chips.map((chip) => (
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
              );
            })}
          </Column>
          <Text variant="tiny" color="textFaint" style={{ color: colors.textFaint }}>
            ویرایش: لمس · حذف: نگه‌داشتن
          </Text>
        </>
      ) : null}
    </Column>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  ltr: { writingDirection: 'ltr' },
});
