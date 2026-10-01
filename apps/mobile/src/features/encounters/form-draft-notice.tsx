import { Button, Card, Column, Text } from '@/components/ui';
import { formatJalali } from '@/lib/jalali';

import { decodeEncounterForm, type EncounterFormDocument } from './form-draft';
import { DISCHARGE_TYPE_LABELS, ENCOUNTER_KIND_LABELS } from './labels';
import type { EncounterFormSeed, useEncounterFormDraft } from './use-form-draft';

const LABELS: Record<string, string> = {
  kind: 'نوع',
  placeId: 'مرکز',
  ward: 'بخش',
  bed: 'تخت',
  service: 'سرویس',
  attendingId: 'اتند',
  chiefComplaint: 'شکایت اصلی',
  date: 'تاریخ و ساعت',
  hourKnown: 'ساعت معلوم',
  dischargeType: 'نوع ترخیص',
  nextStatus: 'وضعیت بعد از ترخیص',
  outcomeNotes: 'خلاصهٔ نتیجه',
};
function display(
  doc: EncounterFormDocument,
  key: string,
  name: (kind: 'place' | 'doctor', id: string) => string,
): string {
  const fields = doc.fields;
  if (key === 'date')
    return `${fields.date.dateText} · ${'hourKnown' in fields && !fields.hourKnown ? '۱۲:۰۱ (فرض‌شده)' : fields.date.clockText}`;
  if ('kind' in fields) {
    if (key === 'kind') return ENCOUNTER_KIND_LABELS[fields.kind];
    if (key === 'hourKnown') return fields.hourKnown ? 'بله' : 'خیر';
    if (key === 'placeId') return fields.placeId ? name('place', fields.placeId) : '—';
    if (key === 'attendingId') return fields.attendingId ? name('doctor', fields.attendingId) : '—';
  } else {
    if (key === 'dischargeType') return DISCHARGE_TYPE_LABELS[fields.dischargeType];
    if (key === 'nextStatus')
      return { discharged: 'ترخیص‌شده', followup: 'ادامهٔ پیگیری', outpatient: 'سرپایی' }[fields.nextStatus];
  }
  return String(fields[key as keyof typeof fields] || '—');
}
export function EncounterFormDraftNotice({
  editing,
  seed,
  name = () => 'در فهرست فعلی نیست',
}: {
  editing: ReturnType<typeof useEncounterFormDraft>;
  seed: EncounterFormSeed;
  name?: (kind: 'place' | 'doctor', id: string) => string;
}) {
  const { state, busy, comparison } = editing;
  let stored: EncounterFormDocument | null = null;
  let unreadable = false;
  if (comparison?.rows[0]?.draft) {
    try {
      stored = decodeEncounterForm(comparison.rows[0].draft.body);
    } catch {
      unreadable = true;
    }
  }
  const closed = !!comparison?.original?.deletedAt;
  const clinicalChanged =
    comparison && JSON.stringify(comparison.fresh.basis) !== JSON.stringify(editing.document.basis);
  const comparedFields = clinicalChanged && seed.mode === 'edit' ? comparison?.fresh : stored;
  return (
    <Column gap="xs">
      <Text variant="tiny" color={editing.failedWrite ? 'danger' : 'textMuted'}>
        {editing.finishedMessage
          ? editing.finishedMessage
          : editing.failedWrite
            ? 'ثبت نشد؛ نوشته روی صفحه باقی مانده است.'
            : state.status === 'pending' || state.status === 'writing'
              ? 'در حال ذخیرهٔ پیش‌نویس…'
              : state.status === 'saved'
                ? 'پیش‌نویس ذخیره شد.'
                : seed.row.draft
                  ? 'پیش‌نویس بازیابی شد.'
                  : 'پیش‌نویس خودکار'}
      </Text>
      {editing.failedWrite && !editing.finishedMessage ? (
        <>
          <Button
            label="ذخیره نشد؛ تلاش دوباره"
            variant="ghost"
            size="sm"
            disabled={busy}
            onPress={() => void editing.retry()}
          />
          <Button
            label="بررسی نسخهٔ ذخیره‌شده"
            variant="ghost"
            size="sm"
            disabled={busy}
            onPress={() => void editing.compare()}
          />
        </>
      ) : null}
      {comparison && !editing.finishedMessage ? (
        <Card>
          <Column gap="sm">
            <Text variant="bodyStrong">تفاوت با نوشتهٔ شما</Text>
            {closed ? (
              <Text>
                {comparison.original?.committedEncounterId
                  ? 'این پیش‌نویس قبلاً ثبت شده است.'
                  : 'این پیش‌نویس کنار گذاشته شده است.'}
              </Text>
            ) : null}
            {unreadable ? <Text color="danger">پیش‌نویس خوانا نیست؛ جایگزین نمی‌شود.</Text> : null}
            {clinicalChanged ? (
              <>
                <Text color="danger">نوبت بیمار تغییر کرده است؛ ثبت را پس از بررسی ادامه دهید.</Text>
                {(seed.mode === 'new'
                  ? comparison.fresh.basis.active
                  : comparison.fresh.basis.target
                    ? [comparison.fresh.basis.target]
                    : []
                ).map((row) => (
                  <Column key={row.id} gap="xxs">
                    <Text>
                      {ENCOUNTER_KIND_LABELS[row.kind]} · {row.isActive ? 'فعال' : 'بسته'} ·{' '}
                      {row.ward || 'بخش ثبت نشده'}
                    </Text>
                    {row.chiefComplaint ? <Text selectable>{row.chiefComplaint}</Text> : null}
                    {row.admittedAt != null ? (
                      <Text variant="tiny">{formatJalali(new Date(row.admittedAt))}</Text>
                    ) : null}
                  </Column>
                ))}
              </>
            ) : null}
            {!stored ? <Text variant="tiny">پیش‌نویس بازی وجود ندارد.</Text> : null}
            {comparedFields && comparedFields.mode === editing.document.mode
              ? Object.keys(editing.document.fields)
                  .filter(
                    (key) =>
                      JSON.stringify(comparedFields!.fields[key as keyof typeof comparedFields.fields]) !==
                      JSON.stringify(editing.document.fields[key as keyof typeof editing.document.fields]),
                  )
                  .map((key) => (
                    <Column key={key} gap="xxs">
                      <Text variant="captionStrong">{LABELS[key]}</Text>
                      <Text selectable>نوشتهٔ من: {display(editing.document, key, name)}</Text>
                      <Text selectable>ذخیره‌شده: {display(comparedFields!, key, name)}</Text>
                    </Column>
                  ))
              : null}
            <Button
              label="نگه‌داشتن نوشتهٔ من"
              size="sm"
              disabled={busy || unreadable || closed}
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
