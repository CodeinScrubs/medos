import { useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, Column, Row, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { withDatasetWrite } from '@/lib/dataset-write';
import { formatDuration } from '@/lib/duration';
import { formatJalaliDateTime } from '@/lib/jalali';
import { fullName } from '@/lib/persian';

import type { AttachmentTarget } from './queries';
import { discardRecording, pendingRecordingsQuery, resumeRecording } from './recording-queries';

/** A compact failure-only entry from Today; full actions remain in the existing inbox. */
export function RecordingRecoveryNotice({ onReview }: { onReview: () => void }) {
  const { data, error, retry } = useLive(pendingRecordingsQuery().limit(1));
  if (error) return <ErrorNotice error={error} what="وویس‌های ناتمام" onRetry={retry} />;
  if (!data?.length) return null;
  return <Button label="ذخیرهٔ وویس ناتمام است — بررسی" variant="secondary" onPress={onReview} />;
}

const TARGET_LABELS = {
  patient: 'بیمار',
  encounter: 'بستری',
  note: 'نوت',
  note_draft: 'پیش‌نویس نوت',
  lab_panel: 'آزمایش',
  imaging_study: 'تصویربرداری',
  doctor: 'پزشک',
  topic: 'دانش',
  idea: 'ایده',
  prescription_template: 'قالب نسخه',
  place: 'مکان',
  credential: 'حساب',
  follow_up: 'فالوآپ',
  capture: 'ثبت سریع',
};

/** Failure-only recovery on the original record or the existing inbox. No new route/guard. */
export function RecordingRecovery({
  target,
  excludeId,
  generation: expectedGeneration,
}: {
  target?: AttachmentTarget;
  excludeId?: string;
  generation?: number;
}) {
  const { generation, stale } = useDatasetIntent(expectedGeneration);
  const [limit, setLimit] = useState(20);
  const [busy, setBusy] = useState<string | null>(null);
  const working = useRef(false);
  const { data, error, retry } = useLive(pendingRecordingsQuery(target, excludeId).limit(limit), [
    target?.entityType,
    target?.entityId,
    excludeId,
    limit,
  ]);
  const rows = data ?? [];

  async function act(id: string, discard: boolean) {
    if (working.current) return;
    working.current = true;
    setBusy(id);
    try {
      await withDatasetWrite(generation, async () => {
        if (discard) await discardRecording(id, new Date());
        else await resumeRecording(id, new Date());
      });
      retry();
    } catch (e) {
      alertError(discard ? 'پاک‌کردن کپی ناتمام انجام نشد' : 'وویس ذخیره نشد', e);
    } finally {
      working.current = false;
      setBusy(null);
    }
  }

  if (!error && !rows.length) return null;
  return (
    <Column gap="sm">
      <ErrorNotice error={error} what="وویس‌های ناتمام" onRetry={retry} />
      {rows.length ? (
        <Text variant="caption" color="danger">
          ذخیرهٔ وویس ناتمام است
        </Text>
      ) : null}
      {rows.map(({ job, firstName, lastName }) => (
        <Column key={job.id} gap="xs">
          <Text variant="caption">
            {!target ? `${TARGET_LABELS[job.entityType]} — ` : ''}
            {!target && job.patientId ? `${fullName(firstName, lastName) || 'بیمار در دسترس نیست'} — ` : ''}
            {formatJalaliDateTime(job.capturedAt)} · {formatDuration(job.durationMs)}
          </Text>
          <Row gap="sm">
            {!job.deletedAt ? (
              <Button
                label="تلاش دوباره"
                variant="secondary"
                size="sm"
                loading={busy === job.id}
                disabled={stale || busy != null}
                onPress={() => void act(job.id, false)}
              />
            ) : null}
            <Button
              label={job.state === 'discarding' ? 'تکمیل حذف کپی' : 'صرف‌نظر'}
              variant="ghost"
              size="sm"
              disabled={stale || busy != null}
              onPress={() => {
                if (job.state === 'discarding') {
                  void act(job.id, true);
                  return;
                }
                Alert.alert(
                  'از این وویس صرف‌نظر شود؟',
                  'فقط کپی ناتمام حذف می‌شود؛ رکوردهای ذخیره‌شده تغییر نمی‌کنند.',
                  [
                    { text: 'انصراف', style: 'cancel' },
                    { text: 'صرف‌نظر', style: 'destructive', onPress: () => void act(job.id, true) },
                  ],
                );
              }}
            />
          </Row>
        </Column>
      ))}
      {rows.length === limit ? (
        <Button label="موارد بیشتر" variant="ghost" size="sm" onPress={() => setLimit(limit + 20)} />
      ) : null}
    </Column>
  );
}
