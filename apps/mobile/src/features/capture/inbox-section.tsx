import { useRouter } from 'expo-router';
import { useNavigation } from 'expo-router/react-navigation';
import { useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { PickerModal, type PickerItem } from '@/components/picker-modal';
import { Button, Column, Row, SectionHeader, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { PhotoRecoveryNotice } from '@/features/attachments/photo-recovery';
import { RecordingRecoveryNotice } from '@/features/attachments/recording-recovery';
import { patientPickerSublabel } from '@/features/patients/logic';
import { patientListQuery } from '@/features/patients/queries';
import { withDatasetWrite } from '@/lib/dataset-write';
import { fullName, toPersianDigits } from '@/lib/persian';

import { CaptureCard, groupMedia, NO_MEDIA, type PatientAsk } from './capture-card';
import { captureCountQuery, captureMediaQuery, fileCaptureAsNote, inboxQuery, updateCapture } from './queries';

const SHOWN = 3;

/**
 * The inbox on Today: the few oldest unfiled captures, and how many more.
 *
 * It is on Today rather than behind a menu because an inbox nobody sees is a
 * place things go to be lost.
 */
export function InboxSection() {
  const router = useRouter();
  const navigation = useNavigation();
  const { generation, stale } = useDatasetIntent();
  const captures = useLive(inboxQuery(SHOWN));
  const count = useLive(captureCountQuery(false));
  const attachments = useLive(captureMediaQuery());
  const { data } = captures;
  const { data: media } = attachments;
  const [ask, setAsk] = useState<PatientAsk | null>(null);
  const saving = useRef(false);

  const rows = data ?? [];
  const total = captures.error || count.error ? undefined : count.data?.[0]?.total;
  const byCapture = useMemo(() => groupMedia(media), [media]);

  const patients = useLive(patientListQuery());
  const { data: patientRows } = patients;
  const failed = [
    { label: 'ثبت‌های سریع', query: captures, relevant: true },
    { label: 'تعداد ثبت‌های سریع', query: count, relevant: true },
    { label: 'پیوست‌های ثبت سریع', query: attachments, relevant: rows.length > 0 },
    { label: 'فهرست بیماران', query: patients, relevant: ask != null },
  ].filter(({ query, relevant }) => relevant && query.error);
  const patientItems: PickerItem[] = useMemo(
    () =>
      (patientRows ?? []).map((p) => ({
        id: p.id,
        label: fullName(p.firstName, p.lastName),
        sublabel: patientPickerSublabel(p),
        keywords: p.searchText,
      })),
    [patientRows],
  );

  async function answerAsk(patientId: string) {
    const pending = ask;
    if (!pending || patients.error || patients.loading || saving.current) return;
    saving.current = true;
    try {
      await withDatasetWrite(generation, async () => {
        if (pending.purpose === 'note') {
          const noteId = await fileCaptureAsNote(pending.captureId, { patientId });
          if (navigation.isFocused())
            router.push({ pathname: '/patient/[id]/note', params: { id: patientId, noteId } });
        } else await updateCapture(pending.captureId, { patientId });
      });
      setAsk((current) => (current === pending ? null : current));
    } catch (e) {
      alertError('انجام نشد', e);
    } finally {
      saving.current = false;
    }
  }

  function openCurrentInbox() {
    const open = () => {
      if (!navigation.isFocused()) return;
      setAsk(null);
      router.push('/inbox');
    };
    if (!ask) {
      open();
      return;
    }
    Alert.alert('انتخاب قبلی بسته شود؟', 'انتخاب بیمارِ قبلی ذخیره نمی‌شود؛ ورودی‌های بازگردانی‌شده باز می‌شوند.', [
      { text: 'ادامهٔ مرور', style: 'cancel' },
      { text: 'بستن انتخاب قبلی', onPress: open },
    ]);
  }

  if (rows.length === 0 && failed.length === 0 && !ask)
    return (
      <>
        <RecordingRecoveryNotice onReview={() => router.push('/inbox')} />
        <PhotoRecoveryNotice onReview={() => router.push('/inbox')} />
      </>
    );

  return (
    <>
      <RecordingRecoveryNotice onReview={() => router.push('/inbox')} />
      <PhotoRecoveryNotice onReview={() => router.push('/inbox')} />
      <SectionHeader title="ورودی‌ها" count={total} />
      <ErrorNotice
        error={failed[0]?.query.error}
        what={failed.map(({ label }) => label).join('، ')}
        onRetry={() => failed.forEach(({ query }) => query.retry())}
      />
      {stale && <Button label="باز کردن ورودی‌های جدید" variant="secondary" onPress={openCurrentInbox} />}
      <Column gap="sm">
        {rows.slice(0, SHOWN).map(({ capture, patient }) => (
          <CaptureCard
            key={capture.id}
            capture={capture}
            patient={patient}
            media={byCapture.get(capture.id) ?? NO_MEDIA}
            onAskPatient={setAsk}
            generation={generation}
          />
        ))}

        {(total != null && total > SHOWN) || (total == null && rows.length === SHOWN) ? (
          <Row justify="space-between" align="center">
            <Text variant="tiny" color="textFaint">
              {total == null ? 'ثبت‌های بیشتر' : `${toPersianDigits(total - SHOWN)} مورد دیگر`}
            </Text>
            <Button label="همه" variant="ghost" size="sm" haptic={false} onPress={() => router.push('/inbox')} />
          </Row>
        ) : null}
      </Column>

      <PickerModal
        visible={ask != null && !patients.error}
        title={ask?.purpose === 'note' ? 'نوت برای کدام بیمار؟' : 'این برای کیست؟'}
        items={patients.error ? [] : patientItems}
        emptyText={patients.loading ? 'در حال خواندن…' : 'موردی پیدا نشد'}
        selectedId={ask?.selectedId ?? null}
        onClose={() => setAsk(null)}
        onSelect={(item) => void answerAsk(item.id)}
      />
    </>
  );
}
