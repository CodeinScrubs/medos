import { Button, Card, Column, Text } from '@/components/ui';

import type { FormPort, FormRecord } from './types';
import type { useWorkspaceForm } from './use-form';

export function WorkspaceFormStatus<R extends FormRecord, F>({
  editing,
  port,
  describeRecord = port.describeRecord,
  describeFields = port.describeFields,
}: {
  editing: ReturnType<typeof useWorkspaceForm<R, F>>;
  port: FormPort<R, F>;
  describeRecord?: (record: R) => string;
  describeFields?: (fields: F) => string;
}) {
  let stored: F | null = null;
  try {
    if (editing.comparison?.draft) stored = port.codec.decode(editing.comparison.draft.body).fields;
  } catch {
    /* Retain unsupported raw input for copying. */
  }
  return (
    <Column gap="xs">
      {editing.completed || editing.stale || editing.state.status !== 'idle' || editing.hasDraft ? (
        <Text
          variant="tiny"
          color={editing.state.status === 'failed' || editing.stale || editing.failedAction ? 'danger' : 'textMuted'}
        >
          {editing.completed
            ? editing.completed === 'saved'
              ? 'ثبت انجام شد.'
              : 'پیش‌نویس حذف شد.'
            : editing.stale
              ? 'فرم قدیمی است؛ نوشته را مرور یا کپی کنید.'
              : editing.state.status === 'failed'
                ? 'پیش‌نویس ذخیره نشد؛ نوشته نگه داشته شد.'
                : editing.failedAction
                  ? 'انجام نشد؛ نوشته نگه داشته شد.'
                  : editing.state.status === 'pending' || editing.state.status === 'writing'
                    ? 'در حال ذخیرهٔ پیش‌نویس…'
                    : editing.state.status === 'saved'
                      ? 'پیش‌نویس ذخیره شد.'
                      : 'پیش‌نویس بازیابی شد.'}
        </Text>
      ) : null}
      {(editing.state.status === 'failed' || editing.failedAction) && !editing.locked ? (
        <>
          {editing.state.status === 'failed' ? (
            <Button label="تلاش دوباره" size="sm" variant="ghost" onPress={() => void editing.retry()} />
          ) : null}
          <Button label="مقایسهٔ نسخه‌ها" size="sm" variant="ghost" onPress={() => void editing.compare()} />
        </>
      ) : null}
      {editing.comparison ? (
        <Card>
          <Column gap="sm">
            <Text variant="bodyStrong">رکورد ثبت‌شدهٔ فعلی</Text>
            <Text selectable>
              {editing.comparison.record ? describeRecord(editing.comparison.record) : 'هنوز ثبت نشده است.'}
            </Text>
            <Text variant="bodyStrong">پیش‌نویس ذخیره‌شده</Text>
            <Text selectable>
              {stored ? describeFields(stored) : (editing.comparison.draft?.body ?? 'پیش‌نویسی ثبت نشده است.')}
            </Text>
            {stored ? (
              <Button
                label="بارگذاری پیش‌نویس ذخیره‌شده"
                variant="ghost"
                disabled={editing.locked}
                onPress={editing.loadStored}
              />
            ) : null}
            {stored || !editing.comparison.draft ? (
              <Button label="نگه‌داشتن نسخهٔ من" variant="ghost" disabled={editing.locked} onPress={editing.keepMine} />
            ) : null}
          </Column>
        </Card>
      ) : null}
    </Column>
  );
}

/** Keep destructive utilities below the writing and publication controls. */
export function WorkspaceFormDiscard<R extends FormRecord, F>({
  editing,
}: {
  editing: ReturnType<typeof useWorkspaceForm<R, F>>;
}) {
  return editing.hasDraft && !editing.completed && !editing.stale ? (
    <Button label="حذف پیش‌نویس" size="sm" variant="ghost" disabled={editing.locked} onPress={editing.discard} />
  ) : null;
}
