import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { EditGate } from '@/components/edit-gate';
import { ErrorNotice } from '@/components/error-notice';
import { alertError, notify } from '@/components/feedback';
import { PromptModal } from '@/components/prompt-modal';
import { QuickDateField } from '@/components/quick-date-field';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Card, Column, Divider, Input, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import { useNow } from '@/components/use-now';
import { useLive } from '@/db/use-live';
import { entityAttachmentsQuery } from '@/features/attachments/queries';
import { withDatasetWrite } from '@/lib/dataset-write';
import { newId } from '@/lib/ids';
import { ageInYears, formatJalaliDateTime } from '@/lib/jalali';
import { toLatinDigits, toPersianDigits } from '@/lib/persian';
import { mediaUri } from '@/platform/media';
import { useTheme } from '@/theme';

import { computeFlag, FLAG_LABEL, flagTone, formatRange, parseLabValue, parseRangeInput } from './flags';
import { decodeLabForm, initialLabForm, labDisplayDate, type LabEntryRow as EntryRow } from './form-draft';
import { labFormBasis, labFormQuery, type LabFormRows } from './form-draft-queries';
import { isUnreadableNumber, parsePastedTable } from './logic';
import { analyteDef, LAB_PRESETS, rangeFor } from './presets';
import { useLabForm } from './use-lab-form';

/**
 * Lab entry. Params: `id` (patient), optional `panelId` to edit or to
 * transcribe values into a photo-only panel.
 */
export function LabEntryScreen() {
  const { id: patientId, panelId } = useLocalSearchParams<{ id: string; panelId?: string }>();
  return (
    <AutosaveScope key={`${patientId}:${panelId ?? 'new'}`}>
      <LabEntryGate patientId={patientId ?? ''} panelId={panelId ?? null} />
    </AutosaveScope>
  );
}

function LabEntryGate({ patientId, panelId }: { patientId: string; panelId: string | null }) {
  const { stale } = useDatasetIntent();
  const scope = useAutosaveScope()!;
  const router = useRouter();
  const query = useLive(labFormQuery(patientId, panelId), [patientId, panelId]);
  const [retained, setRetained] = useState<LabFormRows>();
  const [reset, setReset] = useState(0);
  if (!stale && !retained && query.data?.[0]) setRetained(query.data);
  const rows = retained ?? query.data;
  let invalidDraft: Error | undefined;
  if (rows?.[0]) {
    try {
      labFormBasis(rows);
      if (rows[0].draft) decodeLabForm(rows[0].draft.body);
    } catch (e) {
      invalidDraft = e instanceof Error ? e : new Error('پیش‌نویس خوانده نشد.');
    }
  }
  if (invalidDraft || (stale && !retained))
    return (
      <Screen scroll>
        <ErrorNotice error={invalidDraft} what="پیش‌نویس آزمایش" />
        {stale ? <Text color="danger">اطلاعات جایگزین شده؛ فرم را دوباره باز کنید.</Text> : null}
        <Text selectable>{rows?.[0]?.draft?.body}</Text>
        <Button
          label="بازگشت"
          variant="ghost"
          onPress={() => {
            if (stale) scope.abandonStale();
            router.back();
          }}
        />
      </Screen>
    );
  return (
    <EditGate<LabFormRows>
      fenceDataset
      editing
      rows={rows ? (rows[0] ? [rows] : []) : undefined}
      error={query.error}
      onRetry={query.retry}
      what="آزمایش"
    >
      {(seed, readNotice, generation) =>
        seed ? (
          <LabEntry
            key={reset}
            seed={seed}
            readNotice={
              <>
                {readNotice}
                {!stale && retained && query.data?.length === 0 && !query.error ? (
                  <Text color="danger">آزمایش یا بیمار در دسترس نیست؛ نوشته نگه داشته شد.</Text>
                ) : null}
              </>
            }
            generation={generation}
            onReset={(next) => {
              setRetained(next);
              setReset((n) => n + 1);
            }}
          />
        ) : null
      }
    </EditGate>
  );
}

function LabEntry({
  seed,
  readNotice,
  generation,
  onReset,
}: {
  seed: LabFormRows;
  readNotice: ReactNode;
  generation: number;
  onReset: (rows: LabFormRows) => void;
}) {
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();

  const editing = useLabForm(seed, onReset);
  const { rows, presetKeys, name, labName, notes, rangeEditor } = editing.form;
  const panel = seed[0]!.panel;
  const patient = seed[0]!.patient;
  const now = new Date(useNow());
  const collectedAt = labDisplayDate(editing.document, now);
  const saving = editing.busy || !!editing.completed || editing.stale;
  const pasteBusy = useRef(false);
  const [pasting, setPasting] = useState(false);
  const dateValidation = useDateValidation();
  const editingRange = rows.find((r) => r.key === rangeEditor?.rowKey) ?? null;
  const rangeContext = {
    sex: patient?.sex ?? null,
    ageYears: ageInYears(patient.birthDate, patient.ageYears, now),
  };

  // A photo of the sheet, when transcribing values into a photo-only panel.
  const { data: sheetPhotos } = useLive(entityAttachmentsQuery('lab_panel', panel?.id ?? ''), [panel?.id]);

  function addPreset(key: string) {
    const preset = LAB_PRESETS.find((p) => p.key === key);
    if (!preset) return;

    editing.change((fields) => {
      const have = new Set(fields.rows.map((r) => r.analyte.toLowerCase()));
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
            notes: null,
            qualitative: Boolean(a.qualitative),
            custom: false,
          };
        });
      const nextKeys = fields.presetKeys.includes(key) ? fields.presetKeys : [...fields.presetKeys, key];
      return {
        ...fields,
        rows: [...fields.rows, ...added],
        presetKeys: nextKeys,
        name: fields.nameTouched
          ? fields.name
          : nextKeys.map((k) => LAB_PRESETS.find((p) => p.key === k)?.label ?? k).join(' + '),
      };
    });
  }

  function addCustomRow() {
    editing.change((fields) => ({
      ...fields,
      rows: [
        ...fields.rows,
        {
          key: newId(),
          analyte: '',
          value: '',
          unit: null,
          refLow: null,
          refHigh: null,
          notes: null,
          qualitative: false,
          custom: true,
        },
      ],
    }));
  }

  function patchRow(key: string, patch: Partial<EntryRow>) {
    editing.change((fields) => ({ ...fields, rows: fields.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
  }

  function removeRow(key: string) {
    editing.change((fields) => ({
      ...fields,
      rows: fields.rows.filter((r) => r.key !== key),
      rangeEditor: fields.rangeEditor?.rowKey === key ? null : fields.rangeEditor,
    }));
  }

  async function pasteFromClipboard() {
    if (pasteBusy.current || !editing.beginPaste()) return;
    pasteBusy.current = true;
    setPasting(true);
    try {
      await withDatasetWrite(generation, async () => {
        const requestedRows = editing.getFields().rows;
        const text = await Clipboard.getStringAsync();
        const lines = parsePastedTable(text);
        if (lines.length === 0) {
          notify(
            'چیزی برای چسباندن نیست',
            'در اکسل یا Google Sheets دو ستون «نام آزمایش» و «مقدار» را انتخاب و کپی کنید، بعد دوباره بزنید.',
          );
          return;
        }

        let applied = false;
        let inserted = 0;
        let preserved = 0;
        editing.change((fields) => {
          applied = true;
          const next = [...fields.rows];
          for (const [analyte, value, unit] of lines) {
            const name = analyte.toLowerCase();
            const before = requestedRows.find((r) => r.analyte.toLowerCase() === name);
            const current = before ? fields.rows.find((r) => r.key === before.key) : undefined;
            const addedManually = !before && fields.rows.find((r) => r.analyte.toLowerCase() === name);
            // A late clipboard result must not undo newer typing, clears, renames
            // or deletion. Compare the arrival snapshot, not earlier pasted lines.
            if (
              (before &&
                (!current ||
                  current.analyte !== before.analyte ||
                  current.value !== before.value ||
                  current.unit !== before.unit)) ||
              (addedManually && addedManually.value.trim())
            ) {
              preserved++;
              continue;
            }
            inserted++;
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
              notes: null,
              qualitative: Boolean(def?.qualitative),
              custom: !def,
            });
          }
          return { ...fields, rows: next };
        });
        if (!applied) return;
        notify(
          inserted ? 'چسبانده شد' : 'مقادیر تازه نگه داشته شدند',
          `${toPersianDigits(inserted)} مقدار وارد شد.${preserved ? ` ${toPersianDigits(preserved)} مقدار تازهٔ این فرم جایگزین نشد.` : ''} قبل از ذخیره، واحدها و محدوده‌ها را یک نگاه بیندازید.`,
        );
      });
    } finally {
      pasteBusy.current = false;
      editing.endPaste();
      setPasting(false);
    }
  }

  const filledCount = rows.filter((r) => r.analyte.trim() && r.value.trim()).length;

  async function save() {
    if (pasteBusy.current) return;
    if (editing.completed) editing.close();
    else if (dateValidation.check()) await editing.save(Boolean(sheetPhotos?.length));
  }

  return (
    <Screen scroll>
      <ScreenOptions
        options={{
          title: panel ? 'ویرایش آزمایش' : 'آزمایش جدید',
          // Keep explicit publication reachable while the keyboard covers the footer.
          // The slot stays mounted through pending/completed states without setOptions.
          headerRight: () => (
            <Button
              label={editing.completed ? 'بستن' : 'ثبت آزمایش'}
              size="sm"
              variant="ghost"
              onPress={() => void save()}
              loading={editing.busy}
              disabled={pasting || editing.busy || (editing.stale && !editing.completed)}
            />
          ),
        }}
      />
      <Column
        gap="md"
        collapsable={false}
        pointerEvents={editing.busy ? 'none' : 'auto'}
        style={{ paddingTop: spacing.md }}
      >
        {readNotice}
        <Text variant="tiny" color={editing.state.status === 'failed' ? 'danger' : 'textMuted'}>
          {editing.completed === 'saved'
            ? 'آزمایش ثبت شد.'
            : editing.completed === 'discarded'
              ? 'پیش‌نویس حذف شد.'
              : editing.state.status === 'failed'
                ? 'پیش‌نویس ذخیره نشد؛ نوشته نگه داشته شد.'
                : editing.state.status === 'pending' || editing.state.status === 'writing'
                  ? 'در حال ذخیرهٔ پیش‌نویس…'
                  : editing.state.status === 'saved'
                    ? 'پیش‌نویس ذخیره شد.'
                    : seed[0]?.draft
                      ? 'پیش‌نویس بازیابی شد.'
                      : 'نوشته‌ها خودکار در پیش‌نویس ذخیره می‌شوند.'}
        </Text>
        {editing.state.status === 'failed' && !editing.stale ? (
          <Button
            label="ذخیره نشد؛ تلاش دوباره"
            variant="ghost"
            onPress={() => void editing.retry()}
            disabled={saving}
          />
        ) : null}
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
          disabled={saving}
          onValidityChange={dateValidation.setValid}
          label="زمان نمونه‌گیری"
          value={collectedAt}
          rawInput={editing.form.date}
          onRawInputChange={(patch) => editing.change((fields) => ({ ...fields, date: { ...fields.date, ...patch } }))}
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
                  disabled={saving}
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
              disabled={saving}
              loading={pasting}
              onPress={() => void pasteFromClipboard().catch((e) => alertError('چسبانده نشد', e))}
            />
          </View>
          <View style={styles.grow}>
            <Button
              label="آنالیت دیگر"
              icon="add"
              variant="ghost"
              size="sm"
              full
              disabled={saving}
              onPress={addCustomRow}
            />
          </View>
        </Row>

        {rows.length > 0 && (
          <Card padded={false}>
            {rows.map((r, i) => (
              <View key={r.key}>
                {i > 0 && <Divider />}
                <LabRowEditor
                  disabled={saving}
                  row={r}
                  onChange={(patch) => patchRow(r.key, patch)}
                  onRemove={() => removeRow(r.key)}
                  onEditRange={() =>
                    editing.change((fields) => {
                      const current = fields.rows.find((row) => row.key === r.key);
                      return !current
                        ? fields
                        : {
                            ...fields,
                            rangeEditor: {
                              id: newId(),
                              rowKey: r.key,
                              text: formatRange(current.refLow, current.refHigh).replace('–', '-'),
                            },
                          };
                    })
                  }
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
          editable={!saving}
          label="نام پنل"
          value={name}
          onChangeText={(t) => {
            editing.change({ name: t, nameTouched: true });
          }}
          ltr
        />
        <Input
          label="آزمایشگاه"
          value={labName}
          onChangeText={(labName) => editing.change({ labName })}
          editable={!saving}
        />
        <Input
          label="یادداشت"
          value={notes}
          onChangeText={(notes) => editing.change({ notes })}
          multiline
          editable={!saving}
        />

        <Button
          label={
            editing.completed ? 'بستن' : filledCount > 0 ? `ذخیره (${toPersianDigits(filledCount)} مقدار)` : 'ذخیره'
          }
          icon="checkmark"
          onPress={() => void save()}
          loading={editing.busy}
          disabled={pasting || (editing.stale && !editing.completed)}
          full
          style={{ marginTop: spacing.sm }}
        />
        {editing.state.status === 'failed' || editing.failedWrite || editing.comparison ? (
          <Button
            label="بررسی نسخهٔ ذخیره‌شده"
            variant="ghost"
            disabled={saving || pasting}
            onPress={() => void editing.compare()}
          />
        ) : null}
        {editing.comparison ? <LabFormComparison editing={editing} disabled={pasting} /> : null}
        {!editing.completed && editing.hasDraft ? (
          <Button label="حذف پیش‌نویس" variant="ghost" full disabled={saving || pasting} onPress={editing.discard} />
        ) : null}
        <Button
          label={editing.completed ? 'بازگشت' : 'بازگشت؛ نگه‌داشتن پیش‌نویس'}
          variant="ghost"
          onPress={editing.close}
          full
          haptic={false}
          disabled={editing.busy || pasting}
        />
      </Column>

      <PromptModal
        busy={saving}
        visible={editingRange != null}
        title={`محدوده‌ی نرمال ${editingRange?.analyte ?? ''}`}
        message="مثلاً ۱۳۵-۱۴۵ یا <5 یا >40. خالی بگذارید تا پرچم H/L نزند."
        initialValue={editingRange ? formatRange(editingRange.refLow, editingRange.refHigh).replace('–', '-') : ''}
        value={rangeEditor?.text ?? ''}
        onChangeText={(text) =>
          editing.change((fields) =>
            fields.rangeEditor?.id !== rangeEditor?.id
              ? fields
              : {
                  ...fields,
                  rangeEditor: fields.rangeEditor ? { ...fields.rangeEditor, text } : null,
                },
          )
        }
        onCancel={() =>
          editing.change((fields) =>
            fields.rangeEditor?.id === rangeEditor?.id ? { ...fields, rangeEditor: null } : fields,
          )
        }
        onSubmit={(text) => {
          const parsed = parseRangeInput(text);
          if (!parsed) {
            notify('محدوده خوانده نشد', 'به شکل ۱۳۵-۱۴۵ بنویسید.');
            return;
          }
          if (editingRange)
            editing.change((fields) =>
              fields.rangeEditor?.id !== rangeEditor?.id ||
              fields.rangeEditor?.rowKey !== editingRange.key ||
              fields.rangeEditor.text.trim() !== text.trim()
                ? fields
                : {
                    ...fields,
                    rows: fields.rows.map((r) =>
                      r.key === editingRange.key ? { ...r, refLow: parsed.low, refHigh: parsed.high } : r,
                    ),
                    rangeEditor: null,
                  },
            );
        }}
      />
    </Screen>
  );
}

function LabFormComparison({ editing, disabled }: { editing: ReturnType<typeof useLabForm>; disabled: boolean }) {
  const rows = editing.comparison!.rows;
  const context = rows[0]!;
  const now = new Date(useNow());
  let stored;
  try {
    stored = context.draft
      ? decodeLabForm(context.draft.body).fields
      : initialLabForm(
          context.panel,
          rows.flatMap((r) => (r.value ? [r.value] : [])),
          context.active?.id ?? null,
          now,
        ).fields;
  } catch {
    return (
      <Card>
        <Text color="danger">پیش‌نویس ذخیره‌شده خوانا نیست؛ نوشتهٔ این صفحه حفظ شده است.</Text>
      </Card>
    );
  }
  return (
    <Card>
      <Column gap="sm">
        {context.panel ? (
          <>
            <Text variant="bodyStrong">آزمایش ثبت‌شدهٔ فعلی</Text>
            <Text selectable>
              {context.panel.name || 'بدون نام'} — {formatJalaliDateTime(context.panel.collectedAt)}
            </Text>
            <Text selectable>{context.panel.labName}</Text>
            <Text selectable>{context.panel.notes}</Text>
            {rows
              .flatMap((r) => (r.value ? [r.value] : []))
              .map((r) => (
                <Text key={r.id} numeric selectable>
                  {r.analyte}: {r.value} {r.unit} {formatRange(r.refLow, r.refHigh)}
                  {r.notes ? ` · ${r.notes}` : ''}
                </Text>
              ))}
            <Divider />
          </>
        ) : null}
        <Text variant="bodyStrong">پیش‌نویس ذخیره‌شده</Text>
        <Text selectable>
          {stored.name || 'بدون نام'} — {stored.date.dateText} {stored.date.clockText}
        </Text>
        <Text selectable>{stored.labName}</Text>
        <Text selectable>{stored.notes}</Text>
        {stored.rows.map((r) => (
          <Text key={r.key} numeric selectable>
            {r.analyte}: {r.value} {r.unit} {formatRange(r.refLow, r.refHigh)}
            {r.notes ? ` · ${r.notes}` : ''}
          </Text>
        ))}
        {stored.rangeEditor ? <Text selectable>محدودهٔ ناتمام: {stored.rangeEditor.text}</Text> : null}
        <Button
          label="بارگذاری نسخهٔ ذخیره‌شده"
          variant="ghost"
          disabled={disabled || editing.busy || editing.stale}
          onPress={editing.loadStored}
        />
        <Button
          label="نگه‌داشتن نسخهٔ من"
          variant="ghost"
          disabled={disabled || editing.busy || editing.stale}
          onPress={editing.keepMine}
        />
      </Column>
    </Card>
  );
}

function LabRowEditor({
  disabled,
  row,
  onChange,
  onRemove,
  onEditRange,
}: {
  disabled: boolean;
  row: EntryRow;
  onChange: (patch: Partial<EntryRow>) => void;
  onRemove: () => void;
  onEditRange: () => void;
}) {
  const { colors, radii, spacing, typography } = useTheme();
  const parsed = row.qualitative ? null : parseLabValue(row.value);
  const flag = row.qualitative ? null : computeFlag(parsed, row.refLow, row.refHigh);
  const unreadable = !row.qualitative && isUnreadableNumber(row.value, !row.custom);
  const tone = flagTone(flag);
  const flagColor = unreadable
    ? colors.danger
    : tone === 'danger'
      ? colors.danger
      : tone === 'warning'
        ? colors.warning
        : tone === 'info'
          ? colors.info
          : null;
  const range = formatRange(row.refLow, row.refHigh);

  return (
    <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
      {/* The row is laid out LTR on purpose: analyte on the left, value on the
          right, exactly like the printed sheet it is being copied from. */}
      <View style={[styles.ltrRow, { gap: spacing.sm }]}>
        <View style={styles.grow}>
          {row.custom ? (
            <TextInput
              editable={!disabled}
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
          <Pressable onPress={onEditRange} hitSlop={6} disabled={disabled}>
            <Text variant="tiny" color="textFaint" ltr>
              {[row.unit, range ? `ref ${range}` : row.qualitative ? null : 'no ref range'].filter(Boolean).join(' · ')}
            </Text>
          </Pressable>
        </View>

        <TextInput
          editable={!disabled}
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
          {unreadable ? (
            <Text variant="captionStrong" ltr style={{ color: colors.danger }} accessibilityLabel="عدد خوانا نیست">
              ?
            </Text>
          ) : flag && flag !== 'normal' ? (
            <Text variant="captionStrong" ltr style={{ color: flagColor ?? colors.text }}>
              {FLAG_LABEL[flag]}
            </Text>
          ) : row.custom ? (
            <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel="حذف ردیف" disabled={disabled}>
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
