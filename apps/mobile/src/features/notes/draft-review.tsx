import { Button, Card, Column, Text } from '@/components/ui';
import type { Note, NoteDraft } from '@/db/schema';
import { formatJalali, formatJalaliDateTime } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';

import { noteDateInput } from './draft-context';
import type { NoteDraftComparison } from './draft-queries';
import { NOTE_TYPE_LABELS } from './labels';

const FIELD_LABELS = {
  title: 'عنوان',
  subjective: 'Subjective',
  objective: 'Objective',
  assessment: 'Assessment',
  plan: 'Plan',
  body: 'متن',
  authorName: 'ثبت‌کننده',
  specialty: 'سرویس',
} as const;

function Snapshot({ row, doctorName }: { row: Note | NoteDraft; doctorName: (id: string) => string }) {
  const raw =
    'rawDate' in row && row.rawDate != null ? noteDateInput(row.rawDate, row.noteDate ?? row.createdAt) : null;
  return (
    <Column gap="xs">
      <Text>{NOTE_TYPE_LABELS[row.type]}</Text>
      {raw ? (
        <Text selectable>
          {raw.dateText} · {raw.clockText}
        </Text>
      ) : row.noteDate ? (
        <Text>{formatJalaliDateTime(row.noteDate)}</Text>
      ) : null}
      {(Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[])
        .filter((key) => key in row && row[key as keyof typeof row] != null && row[key as keyof typeof row] !== '')
        .map((key) => (
          <Text key={key} selectable>
            {FIELD_LABELS[key]}: {String(row[key as keyof typeof row])}
          </Text>
        ))}
      {row.doctorId ? <Text>پزشک: {doctorName(row.doctorId)}</Text> : null}
      <Text>
        {row.isDraft ? 'پیش‌نویس' : 'ثبت‌شده'} · {row.isPinned ? 'سنجاق‌شده' : 'بدون سنجاق'}
      </Text>
      {'voices' in row && row.voices?.length ? (
        <Text>{toPersianDigits(row.voices.length)} وویسِ همراه پیش‌نویس</Text>
      ) : null}
    </Column>
  );
}

/** Visible only for recovery/conflict; full text remains selectable, never a bounded preview. */
export function NoteDraftReview({
  comparison,
  doctorName,
  disabled,
  onAdopt,
}: {
  comparison: NoteDraftComparison;
  doctorName: (id: string) => string;
  disabled: boolean;
  onAdopt: () => void;
}) {
  return (
    <Card>
      <Column gap="sm">
        <Text variant="bodyStrong">نسخهٔ فعلی پرونده</Text>
        {comparison.note ? (
          <Snapshot row={comparison.note} doctorName={doctorName} />
        ) : (
          <Text>نوت جدید؛ هنوز متن ثبت‌شده‌ای ندارد.</Text>
        )}
        {comparison.encounter ? (
          <Text>
            بستری: {comparison.encounter.ward ?? comparison.encounter.service ?? 'محل ثبت نشده'}
            {comparison.encounter.bed ? ` · تخت ${comparison.encounter.bed}` : ''}
            {comparison.encounter.admittedAt
              ? ` · ${comparison.encounter.admittedAtHasTime ? formatJalaliDateTime(comparison.encounter.admittedAt) : formatJalali(comparison.encounter.admittedAt) + ' (ساعت ثبت نشده)'}`
              : ''}
          </Text>
        ) : (
          <Text>بدون بستری</Text>
        )}
        <Text variant="bodyStrong">پیش‌نویس ذخیره‌شده</Text>
        <Snapshot row={comparison.draft} doctorName={doctorName} />
        <Text variant="caption" color="textMuted">
          نوشتهٔ شما در فرم پایین باقی مانده است؛ تطبیق فقط پیش‌نویس را تغییر می‌دهد.
        </Text>
        <Button label="تطبیق و نگه‌داشتن نوشتهٔ من" disabled={disabled} onPress={onAdopt} />
      </Column>
    </Card>
  );
}
