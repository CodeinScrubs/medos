import { useState } from 'react';
import { View } from 'react-native';

import { notify } from '@/components/feedback';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, Card, ChipSelect, Column, Field, Input, Row, Text } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import { useNow } from '@/components/use-now';
import { BLOOD_SUGAR_UNITS } from '@/lib/glucose-unit';
import { formatJalaliDateTime } from '@/lib/jalali';

import { decodeVitalForm, parseVitalDocument, vitalFormTime, type VitalFormFields } from './form-draft';
import type { VitalFormRow } from './form-draft-queries';
import { hasAnyVital, vitalChips, type VitalForm as VitalRawForm } from './logic';
import { useVitalForm } from './use-form-draft';

const LABELS: Record<keyof VitalRawForm, string> = {
  bp: 'فشار (mmHg)',
  heartRate: 'نبض',
  respRate: 'تنفس',
  temperature: 'دما (°C)',
  spo2: 'اشباع اکسیژن',
  bloodSugar: 'قند',
  bloodSugarUnit: 'واحد قند',
  weightKg: 'وزن (kg)',
  heightCm: 'قد (cm)',
  painScore: 'درد (0 تا 10)',
  urineOutput: 'ادرار',
  notes: 'توضیح',
};
export function VitalForm({
  seed,
  onClose,
  onReset,
  switching,
  isSwitching,
}: {
  seed: VitalFormRow;
  onClose: () => void;
  onReset: (row: VitalFormRow) => void;
  switching: boolean;
  isSwitching: () => boolean;
}) {
  const editing = useVitalForm(seed, onClose, onReset, isSwitching);
  const locked = editing.locked || switching;
  const form = editing.document.fields;
  const dateValidation = useDateValidation();
  const now = useNow();
  const [errors, setErrors] = useState<Partial<Record<keyof VitalRawForm, string>>>({});
  let measuredAt = new Date(editing.document.initialDate);
  try {
    measuredAt = vitalFormTime(editing.document, new Date(now));
  } catch {
    /* Keep invalid raw text visible. */
  }
  function save() {
    if (editing.completed || editing.stale) {
      editing.close();
      return;
    }
    void editing.save((document) => {
      if (!dateValidation.check()) return false;
      const parsed = parseVitalDocument(document);
      setErrors(parsed.ok ? {} : parsed.errors);
      if (!parsed.ok) return false;
      try {
        vitalFormTime(document, new Date(now));
      } catch {
        notify('ثبت نشد', 'تاریخ یا ساعت اندازه‌گیری را بررسی کنید.');
        return false;
      }
      if (!seed.vital && !hasAnyVital(parsed.values)) {
        notify('چیزی ثبت نشده', 'حداقل یک اندازه‌گیری بنویسید.');
        return false;
      }
      return true;
    });
  }
  let stored: VitalFormFields | null = null;
  try {
    if (editing.comparison?.row.draft) stored = decodeVitalForm(editing.comparison.row.draft.body).fields;
  } catch {
    /* Do not replace unreadable input. */
  }
  function input(key: Exclude<keyof VitalRawForm, 'bloodSugarUnit'>, placeholder?: string) {
    const free = key === 'bp' || key === 'urineOutput' || key === 'notes';
    return (
      <Input
        label={LABELS[key]}
        value={form[key]}
        editable={!locked}
        error={errors[key]}
        onChangeText={(value) => editing.change({ [key]: value })}
        ltr={key !== 'notes'}
        keyboardType={free ? 'default' : 'numeric'}
        numericFold={!free}
        multiline={key === 'notes'}
        placeholder={placeholder}
      />
    );
  }
  return (
    <Card tone="alt">
      <Column collapsable={false} gap="sm" pointerEvents={editing.busy || switching ? 'none' : 'auto'}>
        <Text variant="captionStrong">{seed.vital ? 'اصلاح اندازه‌گیری' : 'اندازه‌گیری تازه'}</Text>
        <Row gap="sm" wrap>
          <Button
            label={editing.completed || editing.stale ? 'بستن' : 'ثبت'}
            icon="checkmark"
            onPress={save}
            loading={editing.busy}
            disabled={switching || editing.busy || (editing.locked && !editing.completed && !editing.stale)}
          />
          {!editing.completed && !editing.stale ? (
            <Button label="بستن" variant="ghost" haptic={false} disabled={editing.busy} onPress={editing.close} />
          ) : null}
        </Row>
        <Text variant="tiny" color={editing.state.status === 'failed' || editing.stale ? 'danger' : 'textMuted'}>
          {editing.completed
            ? 'ثبت انجام شد.'
            : editing.stale
              ? 'اطلاعات جایگزین شده؛ نوشتهٔ قبلی قابل مرور است.'
              : editing.state.status === 'failed'
                ? 'پیش‌نویس ذخیره نشد؛ نوشته نگه داشته شد.'
                : editing.state.status === 'pending' || editing.state.status === 'writing'
                  ? 'در حال ذخیرهٔ پیش‌نویس…'
                  : editing.state.status === 'saved'
                    ? 'پیش‌نویس ذخیره شد.'
                    : seed.draft
                      ? 'پیش‌نویس بازیابی شد.'
                      : 'پیش‌نویس'}
        </Text>
        {seed.patient.deletedAt || seed.vital?.deletedAt ? (
          <Text color="danger">رکورد در دسترس نیست؛ نوشته نگه داشته شد.</Text>
        ) : null}
        <QuickDateField
          label="زمان اندازه‌گیری"
          value={measuredAt}
          rawInput={form.date}
          onRawInputChange={editing.changeDate}
          onValidityChange={dateValidation.setValid}
          disabled={editing.locked}
          direction="past"
          withTime
        />
        <Row gap="sm">
          <View style={{ flex: 1 }}>{input('bp', '120/80')}</View>
          <View style={{ flex: 1 }}>{input('heartRate')}</View>
        </Row>
        <Row gap="sm">
          <View style={{ flex: 1 }}>{input('temperature')}</View>
          <View style={{ flex: 1 }}>{input('spo2')}</View>
          <View style={{ flex: 1 }}>{input('respRate')}</View>
        </Row>
        <Row gap="sm" align="flex-start">
          <View style={{ flex: 1 }}>{input('bloodSugar')}</View>
          <Field label="واحد قند" error={errors.bloodSugarUnit} style={{ flex: 1 }}>
            <ChipSelect
              options={BLOOD_SUGAR_UNITS}
              value={form.bloodSugarUnit || null}
              onChange={(unit) => editing.change({ bloodSugarUnit: unit ?? '' })}
              disabled={locked}
              layout="wrap"
              ltr
            />
            {form.bloodSugar && !form.bloodSugarUnit ? (
              <Text variant="tiny" color="textMuted">
                واحد ثبت نشده
              </Text>
            ) : null}
          </Field>
        </Row>
        <Row gap="sm">
          <View style={{ flex: 1 }}>{input('weightKg')}</View>
          <View style={{ flex: 1 }}>{input('heightCm')}</View>
        </Row>
        <Row gap="sm">
          <View style={{ flex: 1 }}>{input('painScore')}</View>
          <View style={{ flex: 1 }}>{input('urineOutput', 'مثلاً 1200 mL/24h')}</View>
        </Row>
        {input('notes')}
        {(editing.failedWrite || editing.state.status === 'failed') && !editing.stale && !editing.completed ? (
          <Row gap="sm" wrap>
            <Button label="تلاش دوباره" variant="ghost" disabled={editing.busy} onPress={() => void editing.retry()} />
            <Button
              label="بررسی پیش‌نویس ذخیره‌شده"
              variant="ghost"
              disabled={editing.busy || switching}
              onPress={() => void editing.compare()}
            />
          </Row>
        ) : null}
        {editing.comparison ? (
          <Card>
            <Column gap="sm">
              <Text variant="bodyStrong">اطلاعات ثبت‌شدهٔ فعلی</Text>
              {editing.comparison.row.vital ? (
                <>
                  <Text>{formatJalaliDateTime(editing.comparison.row.vital.measuredAt)}</Text>
                  {vitalChips(editing.comparison.row.vital).map((chip) => (
                    <Text key={chip.key} numeric>
                      {chip.label}: {chip.value}
                    </Text>
                  ))}
                  <Text selectable>{editing.comparison.row.vital.notes}</Text>
                </>
              ) : (
                <Text>اندازه‌گیری تازه هنوز ثبت نشده است.</Text>
              )}
              <Text variant="bodyStrong">پیش‌نویس ذخیره‌شده</Text>
              {stored ? (
                <>
                  <Text selectable>
                    {stored.date.dateText} · {stored.date.clockText}
                  </Text>
                  {(Object.keys(LABELS) as (keyof VitalRawForm)[])
                    .filter((key) => stored![key] !== '' || (key === 'bloodSugarUnit' && stored!.bloodSugar !== ''))
                    .map((key) => (
                      <Text key={key} selectable>
                        {LABELS[key]}: {stored![key] || 'ثبت نشده'}
                      </Text>
                    ))}
                </>
              ) : (
                <Text selectable>{editing.comparison.row.draft?.body ?? 'پیش‌نویس دیگری ثبت نشده است.'}</Text>
              )}
              <Button
                label="بارگذاری پیش‌نویس ذخیره‌شده"
                variant="ghost"
                disabled={locked}
                onPress={editing.loadStored}
              />
              {stored || !editing.comparison.row.draft ? (
                <Button
                  label="نگه‌داشتن نسخهٔ من"
                  variant="ghost"
                  disabled={editing.locked}
                  onPress={editing.keepMine}
                />
              ) : null}
            </Column>
          </Card>
        ) : null}
        {editing.hasDraft && !editing.completed && !editing.stale ? (
          <Button label="حذف پیش‌نویس" variant="ghost" disabled={editing.busy} onPress={editing.discard} />
        ) : null}
      </Column>
    </Card>
  );
}
