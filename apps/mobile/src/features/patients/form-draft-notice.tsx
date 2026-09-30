import { Button, Card, Column, Text } from '@/components/ui';
import { toLatinDigits } from '@/lib/persian';

import { decodePatientForm, initialPatientFields, PATIENT_FORM_LABELS, type PatientFormFields } from './form-draft';
import { PATIENT_STATUS, SEX_LABELS } from './labels';
import type { PatientFormSeed, usePatientFormDraft } from './use-form-draft';

function display(key: keyof PatientFormFields, value: PatientFormFields[keyof PatientFormFields]) {
  if (!value) return '—';
  if (key === 'sex') return SEX_LABELS[value as keyof typeof SEX_LABELS];
  if (key === 'status') return PATIENT_STATUS[value as keyof typeof PATIENT_STATUS].label;
  return key === 'birthDateText' ? value : toLatinDigits(value);
}

/** Routine editing gets one short status. Resolution controls appear only after a failure. */
export function PatientFormDraftNotice({
  editing,
  initial,
}: {
  editing: ReturnType<typeof usePatientFormDraft>;
  initial: PatientFormSeed;
}) {
  const { state, comparison, busy } = editing;
  let stored: PatientFormFields | null = null;
  let unreadable = false;
  if (comparison?.draft) {
    try {
      stored = decodePatientForm(comparison.draft.body).fields;
    } catch {
      unreadable = true;
    }
  }
  const chart = comparison?.patient ? initialPatientFields(comparison.patient) : null;
  const keys = Object.keys(PATIENT_FORM_LABELS) as (keyof PatientFormFields)[];
  return (
    <Column gap="xs">
      {!editing.completedId ? (
        <Text variant="tiny" color={editing.failedWrite ? 'danger' : 'textMuted'}>
          {editing.failedWrite
            ? 'ثبت نشد؛ نوشته روی صفحه باقی مانده است.'
            : state.status === 'pending' || state.status === 'writing'
              ? 'در حال ذخیرهٔ پیش‌نویس…'
              : state.status === 'saved'
                ? 'پیش‌نویس ذخیره شد؛ برای تغییر پرونده، دکمهٔ ثبت را بزنید.'
                : initial.draft
                  ? 'پیش‌نویس بازیابی شد.'
                  : 'ورودی‌ها خودکار در پیش‌نویس ذخیره می‌شوند.'}
        </Text>
      ) : (
        <Text color="success">پرونده ثبت شد.</Text>
      )}
      {editing.failedWrite && !editing.completedId ? (
        <>
          <Button
            label="ذخیره نشد؛ تلاش دوباره"
            variant="ghost"
            size="sm"
            disabled={busy}
            onPress={() => void editing.retry()}
          />
          <Button
            label="بررسی نسخه‌های ذخیره‌شده"
            variant="ghost"
            size="sm"
            disabled={busy}
            onPress={() => void editing.compare()}
          />
        </>
      ) : null}
      {comparison ? (
        <Card>
          <Column gap="sm">
            <Text variant="bodyStrong">تفاوت با نوشتهٔ شما</Text>
            {unreadable ? <Text color="danger">پیش‌نویس ذخیره‌شده قابل خواندن نیست؛ جایگزین نمی‌شود.</Text> : null}
            {!stored ? <Text variant="tiny">پیش‌نویس بازی وجود ندارد.</Text> : null}
            {keys
              .filter(
                (key) => (stored && stored[key] !== editing.form[key]) || (chart && chart[key] !== editing.form[key]),
              )
              .map((key) => (
                <Column key={key} gap="xxs">
                  <Text variant="captionStrong">{PATIENT_FORM_LABELS[key]}</Text>
                  <Text numeric={key === 'ageYears'} selectable>
                    نوشتهٔ من: {display(key, editing.form[key])}
                  </Text>
                  {stored ? (
                    <Text numeric={key === 'ageYears'} selectable>
                      پیش‌نویس ذخیره‌شده: {display(key, stored[key])}
                    </Text>
                  ) : null}
                  {chart ? (
                    <Text numeric={key === 'ageYears'} selectable>
                      پرونده: {display(key, chart[key])}
                    </Text>
                  ) : null}
                </Column>
              ))}
            <Button
              label="نگه‌داشتن تغییرات من"
              size="sm"
              disabled={busy || unreadable}
              onPress={() => void editing.keepMine()}
            />
            <Button
              label="بارگذاری نسخهٔ ذخیره‌شده"
              variant="ghost"
              size="sm"
              disabled={busy || unreadable}
              onPress={editing.loadStored}
            />
          </Column>
        </Card>
      ) : null}
    </Column>
  );
}
