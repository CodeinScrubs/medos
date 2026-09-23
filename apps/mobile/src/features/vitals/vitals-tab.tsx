import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { QuickDateField } from '@/components/quick-date-field';
import { TrendChart } from '@/components/trend-chart';
import { Button, Card, ChipSelect, Column, EmptyState, Input, Row, SectionHeader, Text } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import { useLive } from '@/db/use-live';
import { formatJalali, formatJalaliDateTime } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { formatBloodPressureInput, hasAnyVital, parseVitalForm, vitalChips, type VitalForm } from './logic';
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
  const { colors, spacing } = useTheme();
  const { data, error } = useLive(patientVitalsQuery(patientId), [patientId]);
  const rows = data ?? [];

  const [form, setForm] = useState<VitalForm>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const dateValidation = useDateValidation();
  const [errors, setErrors] = useState<Partial<Record<keyof VitalForm, string>>>({});
  const [measuredAt, setMeasuredAt] = useState(() => new Date());
  const [series, setSeries] = useState<VitalSeriesKey>('systolic');

  const set = (key: keyof VitalForm, value: string) => setForm((f) => ({ ...f, [key]: value }));

  function startNew() {
    setForm(EMPTY);
    setErrors({});
    setMeasuredAt(new Date());
    setEditing(null);
    setOpen(true);
  }

  function startEdit(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    setErrors({});
    setMeasuredAt(row.measuredAt);
    setForm({
      bp: formatBloodPressureInput(row.systolic, row.diastolic),
      heartRate: row.heartRate?.toString() ?? '',
      respRate: row.respRate?.toString() ?? '',
      temperature: row.temperature?.toString() ?? '',
      spo2: row.spo2?.toString() ?? '',
      bloodSugar: row.bloodSugar?.toString() ?? '',
      weightKg: row.weightKg?.toString() ?? '',
      heightCm: row.heightCm?.toString() ?? '',
      painScore: row.painScore?.toString() ?? '',
      urineOutput: row.urineOutput ?? '',
      notes: row.notes ?? '',
    });
    setEditing(id);
    setOpen(true);
  }

  async function save() {
    if (!dateValidation.check()) return;
    const parsed = parseVitalForm(form);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    const values = { ...parsed.values, measuredAt };

    if (!hasAnyVital(values)) {
      Alert.alert('چیزی ثبت نشده', 'حداقل یک اندازه‌گیری بنویسید.');
      return;
    }

    setBusy(true);
    try {
      if (editing) await updateVital(editing, values);
      else await recordVital({ patientId, ...values });
      setForm(EMPTY);
      setEditing(null);
      setOpen(false);
    } catch (e) {
      alertError('ثبت نشد', e);
    } finally {
      setBusy(false);
    }
  }

  const availableSeries = SERIES.filter((s) => vitalSeries(rows, s.value).length > 1);
  const selectedSeries = availableSeries.find((s) => s.value === series)?.value ?? availableSeries[0]?.value ?? series;
  const points = vitalSeries(rows, selectedSeries);

  return (
    <Column gap="md" style={{ paddingTop: spacing.md }}>
      <ErrorNotice error={error} what="علائم حیاتی" />

      {open ? (
        <Card tone="alt">
          <Column gap="sm">
            <QuickDateField
              onValidityChange={dateValidation.setValid}
              label="زمان اندازه‌گیری"
              value={measuredAt}
              onChange={setMeasuredAt}
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
                  onChangeText={(v) => set('urineOutput', v)}
                  placeholder="مثلاً 1200 mL/24h"
                  ltr
                />
              </View>
            </Row>

            <Input label="توضیح" value={form.notes} onChangeText={(v) => set('notes', v)} multiline />

            <Row gap="sm">
              <Button label="ثبت" icon="checkmark" onPress={() => void save()} loading={busy} />
              <Button
                label="انصراف"
                disabled={busy}
                variant="ghost"
                haptic={false}
                onPress={() => {
                  setOpen(false);
                  setEditing(null);
                }}
              />
            </Row>
          </Column>
        </Card>
      ) : (
        <Button label="اندازه‌گیری تازه" icon="add" onPress={startNew} full />
      )}

      {rows.length === 0 && data !== undefined ? (
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
          <SectionHeader title="اندازه‌گیری‌ها" count={rows.length} />
          <Column gap="sm">
            {rows.map((row) => {
              const chips = vitalChips(row);
              return (
                <Pressable
                  key={row.id}
                  onPress={() => startEdit(row.id)}
                  onLongPress={() =>
                    Alert.alert('حذف این اندازه‌گیری؟', formatJalaliDateTime(row.measuredAt), [
                      { text: 'انصراف', style: 'cancel' },
                      {
                        text: 'حذف',
                        style: 'destructive',
                        onPress: () => void deleteVital(row.id).catch((e) => alertError('حذف نشد', e)),
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
            برای اصلاح یک اندازه‌گیری رویش بزنید؛ برای حذف، نگه دارید. {toPersianDigits(rows.length)} مورد ثبت شده.
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
