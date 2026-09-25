import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { EditGate } from '@/components/edit-gate';
import { alertError, notify } from '@/components/feedback';
import { PromptModal } from '@/components/prompt-modal';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, Card, Column, Divider, Input, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import type { LabPanel, LabValue } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { entityAttachmentsQuery } from '@/features/attachments/queries';
import { patientQuery } from '@/features/patients/queries';
import { newId } from '@/lib/ids';
import { ageInYears } from '@/lib/jalali';
import { toLatinDigits, toPersianDigits } from '@/lib/persian';
import { mediaUri } from '@/platform/media';
import { useTheme } from '@/theme';

import { computeFlag, FLAG_LABEL, flagTone, formatRange, parseLabValue, parseRangeInput } from './flags';
import { parsePastedTable } from './logic';
import { analyteDef, LAB_PRESETS, rangeFor } from './presets';
import { createLabPanel, labPanelQuery, panelValuesQuery, updateLabPanel } from './queries';

type EntryRow = {
  key: string;
  analyte: string;
  value: string;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  qualitative: boolean;
  /** Custom rows have an editable analyte name; preset rows do not. */
  custom: boolean;
};

/** Rows for the editor from a saved panel's values. */
function initialRows(values: LabValue[]): EntryRow[] {
  return values.map((v) => ({
    key: newId(),
    analyte: v.analyte,
    value: v.value ?? '',
    unit: v.unit,
    refLow: v.refLow,
    refHigh: v.refHigh,
    qualitative: Boolean(analyteDef(v.analyte)?.qualitative),
    custom: !analyteDef(v.analyte),
  }));
}

/**
 * Lab entry. Params: `id` (patient), optional `panelId` to edit or to
 * transcribe values into a photo-only panel.
 */
export function LabEntryScreen() {
  const { id: patientId, panelId } = useLocalSearchParams<{ id: string; panelId?: string }>();
  const { data: panels, error: panelError, retry: retryPanel } = useLive(labPanelQuery(panelId ?? ''), [panelId]);
  const { data: values, error: valuesError, retry: retryValues } = useLive(panelValuesQuery(panelId ?? ''), [panelId]);
  return (
    <EditGate
      editing={Boolean(panelId)}
      rows={panels && values ? panels : undefined}
      error={panelError ?? valuesError}
      onRetry={() => {
        retryPanel();
        retryValues();
      }}
      what="آزمایش"
    >
      {(panel, readNotice) => (
        <LabEntry patientId={patientId} panel={panel} values={values ?? []} readNotice={readNotice} />
      )}
    </EditGate>
  );
}

function LabEntry({
  patientId,
  panel,
  values,
  readNotice,
}: {
  patientId: string;
  panel: LabPanel | null;
  values: LabValue[];
  readNotice: ReactNode;
}) {
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();

  const [collectedAt, setCollectedAt] = useState(() => panel?.collectedAt ?? new Date());
  const [rows, setRows] = useState<EntryRow[]>(() => initialRows(values));
  const [presetKeys, setPresetKeys] = useState<string[]>([]);
  const [name, setName] = useState(panel?.name ?? '');
  const [nameTouched, setNameTouched] = useState(Boolean(panel?.name));
  const [labName, setLabName] = useState(panel?.labName ?? '');
  const [notes, setNotes] = useState(panel?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const dateValidation = useDateValidation();
  const [editingRange, setEditingRange] = useState<EntryRow | null>(null);

  const { data: patientRows } = useLive(patientQuery(patientId), [patientId]);
  const patient = patientRows?.[0];
  const rangeContext = useMemo(
    () => ({
      sex: patient?.sex ?? null,
      ageYears: patient ? ageInYears(patient.birthDate, patient.ageYears) : null,
    }),
    [patient],
  );

  // A photo of the sheet, when transcribing values into a photo-only panel.
  const { data: sheetPhotos } = useLive(entityAttachmentsQuery('lab_panel', panel?.id ?? ''), [panel?.id]);

  function addPreset(key: string) {
    const preset = LAB_PRESETS.find((p) => p.key === key);
    if (!preset) return;

    const have = new Set(rows.map((r) => r.analyte.toLowerCase()));
    const added = preset.analytes
      .filter((a) => !have.has(a.analyte.toLowerCase()))
      .map((a): EntryRow => {
        const range = rangeFor(a, rangeContext);
        return {
          key: newId(),
          analyte: a.analyte,
          value: '',
          unit: a.unit ?? null,
          refLow: range?.low ?? null,
          refHigh: range?.high ?? null,
          qualitative: Boolean(a.qualitative),
          custom: false,
        };
      });
    setRows([...rows, ...added]);

    const nextKeys = presetKeys.includes(key) ? presetKeys : [...presetKeys, key];
    setPresetKeys(nextKeys);
    if (!nameTouched) {
      setName(nextKeys.map((k) => LAB_PRESETS.find((p) => p.key === k)?.label ?? k).join(' + '));
    }
  }

  function addCustomRow() {
    setRows((current) => [
      ...current,
      {
        key: newId(),
        analyte: '',
        value: '',
        unit: null,
        refLow: null,
        refHigh: null,
        qualitative: false,
        custom: true,
      },
    ]);
  }

  function patchRow(key: string, patch: Partial<EntryRow>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((r) => r.key !== key));
  }

  async function pasteFromClipboard() {
    const text = await Clipboard.getStringAsync();
    const lines = parsePastedTable(text);
    if (lines.length === 0) {
      notify(
        'چیزی برای چسباندن نیست',
        'در اکسل یا Google Sheets دو ستون «نام آزمایش» و «مقدار» را انتخاب و کپی کنید، بعد دوباره بزنید.',
      );
      return;
    }

    const next = [...rows];
    for (const [analyte, value, unit] of lines) {
      const idx = next.findIndex((r) => r.analyte.toLowerCase() === analyte.toLowerCase());
      const existing = next[idx];
      if (existing) {
        next[idx] = { ...existing, value, unit: existing.unit ?? unit ?? null };
        continue;
      }
      const def = analyteDef(analyte);
      const range = rangeFor(def, rangeContext);
      next.push({
        key: newId(),
        analyte: def?.analyte ?? analyte,
        value,
        unit: unit ?? def?.unit ?? null,
        refLow: range?.low ?? null,
        refHigh: range?.high ?? null,
        qualitative: Boolean(def?.qualitative),
        custom: !def,
      });
    }
    setRows(next);
    notify(
      'چسبانده شد',
      `${toPersianDigits(lines.length)} مقدار وارد شد. قبل از ذخیره، واحدها و محدوده‌ها را یک نگاه بیندازید.`,
    );
  }

  const filledCount = rows.filter((r) => r.analyte.trim() && r.value.trim()).length;

  async function save() {
    if (!dateValidation.check()) return;
    if (filledCount === 0 && !(sheetPhotos && sheetPhotos.length > 0)) {
      notify('هیچ مقداری وارد نشده');
      return;
    }
    setSaving(true);
    const payload = {
      collectedAt,
      name: name.trim() || null,
      // A photo panel keeps its origin when values are transcribed into it later.
      source: panel?.source ?? 'manual',
      labName: labName.trim() || null,
      notes: notes.trim() || null,
      values: rows.map((r) => ({
        analyte: r.analyte,
        value: r.value,
        unit: r.unit,
        refLow: r.refLow,
        refHigh: r.refHigh,
      })),
    };
    try {
      if (panel) await updateLabPanel(panel.id, payload);
      else await createLabPanel({ patientId, ...payload });
      router.back();
    } catch (e) {
      alertError('ذخیره نشد', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {readNotice}
        {sheetPhotos && sheetPhotos.length > 0 && (
          <Column gap="xs">
            <Text variant="captionStrong" color="textMuted">
              عکس برگه — برای بزرگ‌نمایی لمس کنید
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {sheetPhotos.map((a) => (
                <Pressable
                  key={a.id}
                  onPress={() => router.push({ pathname: '/media/[attachmentId]', params: { attachmentId: a.id } })}
                >
                  <Image
                    source={{ uri: mediaUri(a.thumbnailPath ?? a.relativePath) ?? undefined }}
                    style={{ width: 120, height: 160, borderRadius: radii.md, backgroundColor: colors.surfaceAlt }}
                    contentFit="cover"
                  />
                </Pressable>
              ))}
            </ScrollView>
          </Column>
        )}

        <QuickDateField
          onValidityChange={dateValidation.setValid}
          label="زمان نمونه‌گیری"
          value={collectedAt}
          onChange={setCollectedAt}
          direction="past"
          withTime
        />

        <Column gap="xs">
          <Text variant="captionStrong" color="textMuted">
            پنل‌ها — هر کدام را بزنید تا ردیف‌هایش اضافه شود
          </Text>
          <View style={styles.wrap}>
            {LAB_PRESETS.map((p) => {
              const used = presetKeys.includes(p.key);
              return (
                <Pressable
                  key={p.key}
                  onPress={() => addPreset(p.key)}
                  style={[
                    styles.chip,
                    {
                      borderRadius: radii.full,
                      backgroundColor: used ? colors.primarySoft : colors.surface,
                      borderColor: used ? colors.primary : colors.border,
                      paddingHorizontal: spacing.md,
                    },
                  ]}
                >
                  <Text variant="captionStrong" color={used ? 'primary' : 'textMuted'}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Column>

        <Row gap="sm">
          <View style={styles.grow}>
            <Button
              label="چسباندن از اکسل"
              icon="clipboard-outline"
              variant="ghost"
              size="sm"
              full
              onPress={() => void pasteFromClipboard()}
            />
          </View>
          <View style={styles.grow}>
            <Button label="آنالیت دیگر" icon="add" variant="ghost" size="sm" full onPress={addCustomRow} />
          </View>
        </Row>

        {rows.length > 0 && (
          <Card padded={false}>
            {rows.map((r, i) => (
              <View key={r.key}>
                {i > 0 && <Divider />}
                <LabRowEditor
                  row={r}
                  onChange={(patch) => patchRow(r.key, patch)}
                  onRemove={() => removeRow(r.key)}
                  onEditRange={() => setEditingRange(r)}
                />
              </View>
            ))}
          </Card>
        )}

        {rows.length > 0 && rangeContext.ageYears != null && rangeContext.ageYears < 18 && (
          <Text variant="tiny" color="warning">
            بیمار زیر ۱۸ سال است؛ محدوده‌ی نرمال پیش‌فرض گذاشته نشد. محدوده را از برگه‌ی آزمایشگاه وارد کنید.
          </Text>
        )}

        <SectionHeader title="جزئیات" />
        <Input
          label="نام پنل"
          value={name}
          onChangeText={(t) => {
            setName(t);
            setNameTouched(true);
          }}
          ltr
        />
        <Input label="آزمایشگاه" value={labName} onChangeText={setLabName} />
        <Input label="یادداشت" value={notes} onChangeText={setNotes} multiline />

        <Button
          label={filledCount > 0 ? `ذخیره (${toPersianDigits(filledCount)} مقدار)` : 'ذخیره'}
          icon="checkmark"
          onPress={() => void save()}
          loading={saving}
          full
          style={{ marginTop: spacing.sm }}
        />
        <Button label="انصراف" variant="ghost" onPress={() => router.back()} full haptic={false} />
      </Column>

      <PromptModal
        visible={editingRange != null}
        title={`محدوده‌ی نرمال ${editingRange?.analyte ?? ''}`}
        message="مثلاً ۱۳۵-۱۴۵ یا <5 یا >40. خالی بگذارید تا پرچم H/L نزند."
        initialValue={editingRange ? formatRange(editingRange.refLow, editingRange.refHigh).replace('–', '-') : ''}
        onCancel={() => setEditingRange(null)}
        onSubmit={(text) => {
          const parsed = parseRangeInput(text);
          if (!parsed) {
            notify('محدوده خوانده نشد', 'به شکل ۱۳۵-۱۴۵ بنویسید.');
            return;
          }
          if (editingRange) patchRow(editingRange.key, { refLow: parsed.low, refHigh: parsed.high });
          setEditingRange(null);
        }}
      />
    </Screen>
  );
}

function LabRowEditor({
  row,
  onChange,
  onRemove,
  onEditRange,
}: {
  row: EntryRow;
  onChange: (patch: Partial<EntryRow>) => void;
  onRemove: () => void;
  onEditRange: () => void;
}) {
  const { colors, radii, spacing, typography } = useTheme();
  const parsed = row.qualitative ? null : parseLabValue(row.value);
  const flag = row.qualitative ? null : computeFlag(parsed, row.refLow, row.refHigh);
  const tone = flagTone(flag);
  const flagColor =
    tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : tone === 'info' ? colors.info : null;
  const range = formatRange(row.refLow, row.refHigh);

  return (
    <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
      {/* The row is laid out LTR on purpose: analyte on the left, value on the
          right, exactly like the printed sheet it is being copied from. */}
      <View style={[styles.ltrRow, { gap: spacing.sm }]}>
        <View style={styles.grow}>
          {row.custom ? (
            <TextInput
              value={row.analyte}
              onChangeText={(t) => onChange({ analyte: t })}
              placeholder="Analyte"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              style={[typography.bodyStrong, styles.ltrText, { color: colors.text, padding: 0 }]}
            />
          ) : (
            <Text variant="bodyStrong" ltr>
              {row.analyte}
            </Text>
          )}
          <Pressable onPress={onEditRange} hitSlop={6}>
            <Text variant="tiny" color="textFaint" ltr>
              {[row.unit, range ? `ref ${range}` : 'ref —'].filter(Boolean).join(' · ')}
            </Text>
          </Pressable>
        </View>

        <TextInput
          value={row.value}
          onChangeText={(t) => onChange({ value: row.qualitative ? t : toLatinDigits(t) })}
          keyboardType={row.qualitative ? 'default' : 'numbers-and-punctuation'}
          placeholder="—"
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.primary}
          style={[
            typography.mono,
            styles.ltrText,
            {
              width: 96,
              height: 40,
              paddingHorizontal: spacing.sm,
              borderRadius: radii.sm,
              borderWidth: 1,
              borderColor: flagColor ?? colors.border,
              backgroundColor: colors.surface,
              color: flagColor ?? colors.text,
              textAlign: 'right',
            },
          ]}
        />

        <View style={{ width: 22, alignItems: 'center' }}>
          {flag && flag !== 'normal' ? (
            <Text variant="captionStrong" ltr style={{ color: flagColor ?? colors.text }}>
              {FLAG_LABEL[flag]}
            </Text>
          ) : row.custom ? (
            <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel="حذف ردیف">
              <Ionicons name="close" size={16} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  ltrRow: { flexDirection: 'row', alignItems: 'center', direction: 'ltr' },
  ltrText: { writingDirection: 'ltr', textAlign: 'left' },
});
