import { Button, Card, Column, Text } from '@/components/ui';

import { decodeFollowUpForm, type FollowUpFormFields } from './form-draft';
import { FOLLOWUP_CHANNEL_LABELS, FOLLOWUP_PRIORITY_LABELS } from './labels';
import type { FollowUpFormSeed, useFollowUpFormDraft } from './use-form-draft';

const LABELS: Record<keyof FollowUpFormFields, string> = {
  reason: 'دلیل',
  date: 'موعد',
  channel: 'روش',
  priority: 'اهمیت',
};
function display(fields: FollowUpFormFields, key: keyof FollowUpFormFields): string {
  if (key === 'date') return `${fields.date.dateText} · ${fields.date.clockText}`;
  if (key === 'channel') return FOLLOWUP_CHANNEL_LABELS[fields.channel];
  if (key === 'priority') return FOLLOWUP_PRIORITY_LABELS[fields.priority];
  return fields.reason || '—';
}
/** One status during normal use; comparison controls only after a write conflict/failure. */
export function FollowUpFormDraftNotice({
  editing,
  seed,
}: {
  editing: ReturnType<typeof useFollowUpFormDraft>;
  seed: FollowUpFormSeed;
}) {
  const { state, busy, comparison } = editing;
  let stored: FollowUpFormFields | null = null;
  let unreadable = false;
  if (comparison?.row.draft) {
    try {
      stored = decodeFollowUpForm(comparison.row.draft.body).fields;
    } catch {
      unreadable = true;
    }
  }
  const closed = !!comparison?.original?.deletedAt;
  return (
    <Column gap="xs">
      <Text variant="tiny" color={editing.failedWrite ? 'danger' : 'textMuted'}>
        {editing.completedId
          ? 'پیگیری ثبت شد.'
          : editing.failedWrite
            ? 'ثبت نشد؛ نوشته روی صفحه باقی مانده است.'
            : state.status === 'pending' || state.status === 'writing'
              ? 'در حال ذخیرهٔ پیش‌نویس…'
              : state.status === 'saved'
                ? 'پیش‌نویس ذخیره شد.'
                : seed.row.draft
                  ? 'پیش‌نویس بازیابی شد.'
                  : 'ورودی‌ها خودکار در پیش‌نویس ذخیره می‌شوند.'}
      </Text>
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
            label="بررسی نسخهٔ ذخیره‌شده"
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
            {closed ? (
              <Text>
                {comparison.original?.committedFollowUpId
                  ? 'این پیش‌نویس قبلاً ثبت شده است.'
                  : 'این پیش‌نویس کنار گذاشته شده است.'}
              </Text>
            ) : null}
            {unreadable ? <Text color="danger">پیش‌نویس ذخیره‌شده خوانا نیست؛ جایگزین نمی‌شود.</Text> : null}
            {!stored ? <Text variant="tiny">پیش‌نویس بازی وجود ندارد.</Text> : null}
            {stored
              ? (Object.keys(LABELS) as (keyof FollowUpFormFields)[])
                  .filter((key) => JSON.stringify(stored![key]) !== JSON.stringify(editing.form[key]))
                  .map((key) => (
                    <Column key={key} gap="xxs">
                      <Text variant="captionStrong">{LABELS[key]}</Text>
                      <Text selectable>نوشتهٔ من: {display(editing.form, key)}</Text>
                      <Text selectable>ذخیره‌شده: {display(stored!, key)}</Text>
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
