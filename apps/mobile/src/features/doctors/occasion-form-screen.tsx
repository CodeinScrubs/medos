import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';

import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { EditGate } from '@/components/edit-gate';
import { ErrorNotice } from '@/components/error-notice';
import { JalaliDateField } from '@/components/jalali-date-field';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Card, ChipSelect, Column, Input, Screen, Text, Toggle } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import { useNow } from '@/components/use-now';
import type { Occasion } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { formatJalaliLong, fromIsoDate } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { OCCASION_KIND_LABELS } from './labels';
import { DEFAULT_GREETING, occasionNextDate, occasionReminderAt } from './logic';
import {
  decodeOccasionForm,
  initialOccasionForm,
  occasionFormValues,
  type OccasionFormFields,
} from './occasion-form-draft';
import { occasionFormQuery, type OccasionFormRow } from './occasion-form-queries';
import { useOccasionForm } from './use-occasion-form';

const KIND_OPTIONS = (Object.keys(OCCASION_KIND_LABELS) as Occasion['kind'][]).map((value) => ({
  value,
  label: OCCASION_KIND_LABELS[value],
}));
const LEAD_OPTIONS = [
  { value: '0', label: 'همان روز' },
  { value: '1', label: 'یک روز قبل' },
  { value: '3', label: 'سه روز قبل' },
  { value: '7', label: 'یک هفته قبل' },
];

export function OccasionFormScreen() {
  const { doctorId, occasionId } = useLocalSearchParams<{ doctorId: string; occasionId?: string }>();
  return (
    <AutosaveScope key={`${doctorId}:${occasionId ?? 'new'}`}>
      <OccasionFormGate doctorId={doctorId ?? ''} occasionId={occasionId ?? null} />
    </AutosaveScope>
  );
}

/** Seed only once; a failed refresh, parent deletion or restore cannot discard raw input. */
function OccasionFormGate({ doctorId, occasionId }: { doctorId: string; occasionId: string | null }) {
  const { stale } = useDatasetIntent();
  const scope = useAutosaveScope()!;
  const router = useRouter();
  const query = useLive(occasionFormQuery(doctorId, occasionId), [doctorId, occasionId]);
  const [retained, setRetained] = useState<OccasionFormRow[]>();
  const [reset, setReset] = useState(0);
  if (!stale && !retained && query.data?.[0]) setRetained([query.data[0]]);
  const rows = retained ?? query.data;
  let invalidDraft: Error | undefined;
  if (rows?.[0]?.draft) {
    try {
      decodeOccasionForm(rows[0].draft.body);
    } catch (e) {
      invalidDraft = e instanceof Error ? e : new Error('پیش‌نویس خوانده نشد.');
    }
  }
  if (invalidDraft)
    return (
      <Screen scroll>
        <ErrorNotice error={invalidDraft} what="پیش‌نویس مناسبت" />
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
  if (stale && !retained)
    return (
      <Screen>
        <Text color="danger">اطلاعات جایگزین شده؛ فرم را دوباره باز کنید.</Text>
        <Button
          label="بازگشت"
          onPress={() => {
            scope.abandonStale();
            router.back();
          }}
        />
      </Screen>
    );
  return (
    <EditGate editing rows={rows} error={query.error} onRetry={query.retry} what="مناسبت و مخاطب" fenceDataset>
      {(row, notice) =>
        row ? (
          <OccasionForm
            key={reset}
            seed={row}
            readNotice={
              <>
                {notice}
                {!stale && retained && query.data?.length === 0 && !query.error ? (
                  <Text color="danger">مخاطب یا مناسبت دیگر در دسترس نیست؛ نوشته حفظ شده است.</Text>
                ) : null}
              </>
            }
            onReset={(next) => {
              setRetained([next]);
              setReset((n) => n + 1);
            }}
          />
        ) : null
      }
    </EditGate>
  );
}

function OccasionForm({
  seed,
  readNotice,
  onReset,
}: {
  seed: OccasionFormRow;
  readNotice: ReactNode;
  onReset: (row: OccasionFormRow) => void;
}) {
  const { spacing } = useTheme();
  const now = new Date(useNow());
  const editing = useOccasionForm(seed, onReset);
  const f = editing.form;
  const dateValidation = useDateValidation();
  let values: ReturnType<typeof occasionFormValues> | null = null;
  try {
    values = occasionFormValues(editing.document, now);
  } catch {
    /* Incomplete input remains a draft. */
  }
  const next = values ? occasionNextDate(values, now) : null;
  const reminder = values ? occasionReminderAt(values, now) : null;
  const parsed = fromIsoDate(values?.onDate);
  const dateIso = f.isRecurring ? null : parsed ? (values?.onDate ?? null) : null;
  const disabled = editing.busy || editing.completed;
  let stored: OccasionFormFields | null = null;
  let unreadable = false;
  if (editing.comparison) {
    try {
      stored = editing.comparison.row.draft
        ? decodeOccasionForm(editing.comparison.row.draft.body).fields
        : initialOccasionForm(editing.comparison.row.occasion, editing.comparison.row.profile?.birthDate ?? null, now)
            .fields;
    } catch {
      unreadable = true;
    }
  }
  return (
    <Screen scroll>
      <ScreenOptions options={{ title: seed.occasion ? 'ویرایش مناسبت' : 'مناسبت جدید' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {readNotice}
        <Text variant="tiny" color={editing.state.status === 'failed' ? 'danger' : 'textMuted'}>
          {editing.completed
            ? 'مناسبت ثبت شد.'
            : editing.state.status === 'failed'
              ? 'پیش‌نویس ذخیره نشد؛ نوشته روی صفحه باقی مانده است.'
              : editing.state.status === 'pending' || editing.state.status === 'writing'
                ? 'در حال ذخیرهٔ پیش‌نویس…'
                : editing.state.status === 'saved'
                  ? 'پیش‌نویس ذخیره شد.'
                  : seed.draft
                    ? 'پیش‌نویس بازیابی شد.'
                    : 'نوشته‌ها خودکار در پیش‌نویس ذخیره می‌شوند.'}
        </Text>
        {editing.state.status === 'failed' && !editing.stale ? (
          <Button label="ذخیره نشد؛ تلاش دوباره" variant="ghost" onPress={() => void editing.retry()} />
        ) : null}
        <ChipSelect
          label="نوع"
          options={KIND_OPTIONS}
          value={f.kind}
          onChange={(v) => {
            if (v && !disabled) editing.change({ kind: v, ...(v === 'religious' ? { isRecurring: false } : {}) });
          }}
        />
        <Input
          label="عنوان"
          value={f.title}
          editable={!disabled}
          onChangeText={(title) => editing.change({ title })}
          placeholder={OCCASION_KIND_LABELS[f.kind]}
        />
        <JalaliDateField
          label="تاریخ"
          value={dateIso}
          rawText={f.dateText}
          onRawTextChange={(dateText) => editing.change({ dateText })}
          onChange={() => {}}
          onValidityChange={dateValidation.setValid}
          required
          allowFuture
          editable={!disabled}
          hint={f.isRecurring ? 'برای تکرار سالانه فقط ماه و روز نگه داشته می‌شود.' : undefined}
        />
        {!seed.occasion && seed.profile?.birthDate ? (
          <Button
            label="تاریخ تولد پروفایل"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onPress={() =>
              editing.change({ dateText: initialOccasionForm(null, seed.profile!.birthDate, now).fields.dateText })
            }
          />
        ) : null}
        <Toggle
          label="هر سال در همین روز شمسی"
          value={f.isRecurring}
          onChange={(isRecurring) => {
            if (!disabled) editing.change({ isRecurring });
          }}
        />
        <ChipSelect
          label="یادآوری"
          options={LEAD_OPTIONS}
          value={f.leadText}
          onChange={(leadText) => {
            if (leadText && !disabled) editing.change({ leadText });
          }}
        />
        <Toggle
          label="یادآور روشن"
          value={f.isEnabled}
          onChange={(isEnabled) => {
            if (!disabled) editing.change({ isEnabled });
          }}
        />
        {next ? (
          <Text variant="caption" color="textMuted">
            نوبت بعدی: {formatJalaliLong(next)}
            {reminder ? ` — یادآوری ${formatJalaliLong(reminder)} ساعت ۹ صبح` : ' — بدون یادآور'}
          </Text>
        ) : null}
        <Input
          label="متن آمادهٔ تبریک"
          value={f.messageTemplate}
          editable={!disabled}
          multiline
          onChangeText={(messageTemplate) => editing.change({ messageTemplate })}
          placeholder={DEFAULT_GREETING[f.kind]}
          hint="{نام} و {مناسبت} با اطلاعات مخاطب پر می‌شوند."
        />
        <Button
          label={editing.completed ? 'بستن' : seed.occasion ? 'ثبت تغییرات' : 'افزودن مناسبت'}
          icon="checkmark"
          loading={editing.busy}
          disabled={editing.stale}
          full
          onPress={() => {
            if (editing.completed || dateValidation.check()) void editing.save();
          }}
        />
        {editing.state.status === 'failed' || editing.failedWrite || editing.comparison ? (
          <Button
            label="بررسی نسخهٔ ذخیره‌شده"
            variant="ghost"
            disabled={editing.stale || disabled}
            onPress={() => void editing.compare()}
          />
        ) : null}
        {editing.comparison ? (
          <Card>
            <Column gap="xs">
              <Text variant="bodyStrong">نسخهٔ ذخیره‌شده</Text>
              {unreadable ? <Text color="danger">پیش‌نویس خوانا نیست؛ جایگزین نمی‌شود.</Text> : null}
              {stored
                ? (Object.keys(FIELD_LABELS) as (keyof OccasionFormFields)[])
                    .filter((key) => stored![key] !== f[key])
                    .map((key) => (
                      <Column key={key} gap="xxs">
                        <Text variant="captionStrong">{FIELD_LABELS[key]}</Text>
                        <Text selectable>نوشتهٔ من: {displayField(f, key)}</Text>
                        <Text selectable>ذخیره‌شده: {displayField(stored!, key)}</Text>
                      </Column>
                    ))
                : null}
              <Button
                label="نگه‌داشتن نوشتهٔ من"
                disabled={unreadable || editing.stale || disabled || !!editing.comparison.original?.deletedAt}
                onPress={() => void editing.keepMine()}
              />
              <Button
                label="بارگذاری نسخهٔ ذخیره‌شده"
                variant="secondary"
                disabled={unreadable || editing.stale || disabled}
                onPress={editing.loadStored}
              />
            </Column>
          </Card>
        ) : null}
        <Button label="بستن" variant="ghost" onPress={editing.close} disabled={editing.busy} full />
        {editing.hasDraft && !editing.completed ? (
          <Button label="حذف پیش‌نویس" variant="ghost" disabled={editing.stale || disabled} onPress={editing.discard} />
        ) : null}
      </Column>
    </Screen>
  );
}

const FIELD_LABELS: Record<keyof OccasionFormFields, string> = {
  kind: 'نوع',
  title: 'عنوان',
  dateText: 'تاریخ',
  isRecurring: 'تکرار سالانه',
  isEnabled: 'یادآور',
  leadText: 'روزهای قبل',
  messageTemplate: 'متن پیام',
};
function displayField(fields: OccasionFormFields, key: keyof OccasionFormFields): string {
  const value = fields[key];
  return key === 'kind'
    ? OCCASION_KIND_LABELS[fields.kind]
    : typeof value === 'boolean'
      ? value
        ? 'بله'
        : 'خیر'
      : value || '—';
}
