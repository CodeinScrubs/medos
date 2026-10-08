import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, Column, Row, Text } from '@/components/ui';
import { useNow } from '@/components/use-now';
import { useLive } from '@/db/use-live';
import { withDatasetWrite } from '@/lib/dataset-write';
import { formatJalaliDateTime } from '@/lib/jalali';
import { fullName } from '@/lib/persian';

import { discardPhotoImport, pendingPhotoImportsQuery, resumePhotoImport } from './photo-import-queries';
import type { AttachmentTarget } from './queries';

export function PhotoRecoveryNotice({ onReview }: { onReview: () => void }) {
  const { data, error, retry } = useLive(pendingPhotoImportsQuery().limit(1));
  if (error) return <ErrorNotice error={error} what="عکس‌های ناتمام" onRetry={retry} />;
  if (!data?.length) return null;
  return <Button label="ذخیرهٔ عکس ناتمام است — بررسی" variant="secondary" onPress={onReview} />;
}

/** User-directed recovery on an existing screen; never auto-publish on startup. */
export function PhotoRecovery({
  patientId,
  target,
  generation: expectedGeneration,
}: {
  patientId?: string;
  target?: AttachmentTarget;
  generation?: number;
}) {
  const { generation, stale } = useDatasetIntent(expectedGeneration);
  const now = useNow();
  const [limit, setLimit] = useState(20);
  const [busy, setBusy] = useState<string | null>(null);
  const working = useRef(false);
  const mounted = useRef(true);
  const dialog = useRef<symbol | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      dialog.current = null;
    };
  }, []);
  const { data, error, retry } = useLive(pendingPhotoImportsQuery({ patientId, target }).limit(limit), [
    patientId,
    target?.entityType,
    target?.entityId,
    limit,
  ]);
  if (!error && !data?.length) return null;

  async function act(id: string, discard: boolean) {
    if (working.current || dialog.current || !mounted.current) return;
    working.current = true;
    setBusy(id);
    try {
      await withDatasetWrite(generation, async () => {
        if (discard) await discardPhotoImport(id, new Date(now), generation);
        else await resumePhotoImport(id, new Date(now), generation);
      });
      if (mounted.current) retry();
    } catch (e) {
      alertError(discard ? 'صرف‌نظر ثبت نشد' : 'عکس ذخیره نشد', e);
    } finally {
      working.current = false;
      if (mounted.current) setBusy(null);
    }
  }
  function confirmDiscard(id: string) {
    if (working.current || dialog.current || !mounted.current || stale) return;
    const token = Symbol();
    dialog.current = token;
    setBusy(id);
    const consume = (accepted: boolean) => {
      if (!mounted.current || dialog.current !== token) return;
      dialog.current = null;
      setBusy(null);
      if (accepted) void act(id, true);
    };
    Alert.alert(
      'از ثبت این دسته عکس صرف‌نظر شود؟',
      'فایل‌های کپی‌شده برای بررسی حفظ می‌شوند.',
      [
        { text: 'انصراف', style: 'cancel', onPress: () => consume(false) },
        { text: 'صرف‌نظر', style: 'destructive', onPress: () => consume(true) },
      ],
      { cancelable: true, onDismiss: () => consume(false) },
    );
  }

  return (
    <Column gap="sm">
      <ErrorNotice error={error} what="عکس‌های ناتمام" onRetry={retry} />
      {data?.length ? (
        <Text variant="caption" color="danger">
          ذخیرهٔ عکس ناتمام است
        </Text>
      ) : null}
      {data?.map((job) => (
        <Column key={job.id} gap="xs">
          <Text variant="captionStrong">
            {job.patientId
              ? fullName(job.firstName, job.lastName) || 'بیمار در دسترس نیست'
              : job.entityType === 'doctor'
                ? fullName(job.doctorFirstName, job.doctorLastName) || 'پزشک در دسترس نیست'
                : job.entityType === 'capture'
                  ? 'ثبت سریع بدون بیمار'
                  : 'رکورد اصلی'}
          </Text>
          <Text variant="caption">
            {job.mode === 'lab_panel' ? 'عکس برگهٔ آزمایش' : 'دستهٔ عکس'} · {formatJalaliDateTime(job.capturedAt)}
          </Text>
          <Row gap="sm">
            <Button
              label="تلاش دوباره"
              variant="secondary"
              size="sm"
              loading={busy === job.id}
              disabled={stale || busy !== null}
              onPress={() => void act(job.id, false)}
            />
            <Button
              label="صرف‌نظر"
              variant="ghost"
              size="sm"
              disabled={stale || busy !== null}
              onPress={() => confirmDiscard(job.id)}
            />
          </Row>
        </Column>
      ))}
      {data?.length === limit ? (
        <Button label="موارد بیشتر" variant="ghost" size="sm" onPress={() => setLimit(limit + 20)} />
      ) : null}
    </Column>
  );
}
