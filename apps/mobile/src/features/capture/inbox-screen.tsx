import { useRouter } from 'expo-router';
import { useNavigation } from 'expo-router/react-navigation';
import { useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { PickerModal, type PickerItem } from '@/components/picker-modal';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Column, EmptyState, Input, Screen, SectionHeader, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { PhotoRecovery } from '@/features/attachments/photo-recovery';
import { RecordingRecovery } from '@/features/attachments/recording-recovery';
import { patientPickerSublabel } from '@/features/patients/logic';
import { patientListQuery } from '@/features/patients/queries';
import { withDatasetWrite } from '@/lib/dataset-write';
import { fullName } from '@/lib/persian';
import { useTheme } from '@/theme';

import { CaptureCard, groupMedia, NO_MEDIA, type PatientAsk } from './capture-card';
import {
  captureCountQuery,
  captureMediaQuery,
  fileCaptureAsNote,
  filedCapturesQuery,
  inboxQuery,
  updateCapture,
} from './queries';

/**
 * Everything caught and not yet filed, oldest first.
 *
 * Oldest first on purpose: an inbox sorted newest-first quietly buries the
 * thing that has been waiting longest, which is the one most likely to be
 * forgotten for good.
 *
 * Underneath it, what has already been filed — that is where a voice capture's
 * recording still lives after the note was written from it.
 */
export function InboxScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { generation, stale } = useDatasetIntent();
  const saving = useRef(false);
  const { spacing } = useTheme();
  const [search, setSearch] = useState('');
  const [openLimit, setOpenLimit] = useState(50);
  const [filedLimit, setFiledLimit] = useState(20);
  const { data: open, error } = useLive(inboxQuery(openLimit, search), [openLimit, search]);
  const { data: filed, error: filedError } = useLive(filedCapturesQuery(filedLimit, search), [filedLimit, search]);
  const { data: openCount, error: openCountError } = useLive(captureCountQuery(false, search), [search]);
  const { data: filedCount, error: filedCountError } = useLive(captureCountQuery(true, search), [search]);
  const { data: media, error: mediaError } = useLive(captureMediaQuery());
  const [ask, setAsk] = useState<PatientAsk | null>(null);

  const byCapture = useMemo(() => groupMedia(media), [media]);
  const openRows = open ?? [];
  const filedRows = filed ?? [];

  const {
    data: patientRows,
    error: patientError,
    retry: retryPatients,
    loading: patientsLoading,
  } = useLive(patientListQuery());
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
    if (!pending || patientError || patientsLoading || saving.current) return;
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
      router.replace('/inbox');
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

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: 'ورودی‌ها' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <ErrorNotice
          error={error ?? filedError ?? openCountError ?? filedCountError ?? mediaError}
          what="ثبت‌های سریع"
        />
        {stale && (
          <Column gap="xs">
            <Text variant="caption" color="textMuted">
              اطلاعات از بکاپ جایگزین شده؛ انتخاب قبلی ذخیره نمی‌شود.
            </Text>
            <Button label="باز کردن ورودی‌های جدید" variant="secondary" onPress={openCurrentInbox} />
          </Column>
        )}
        <Input
          placeholder="جستجو در متن ثبت‌ها"
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setOpenLimit(50);
            setFiledLimit(20);
          }}
        />

        <Button label="ثبت سریع تازه" icon="add" onPress={() => router.push('/capture')} full />
        <RecordingRecovery generation={generation} />
        <PhotoRecovery generation={generation} />

        {!error && openRows.length === 0 && open !== undefined ? (
          <EmptyState
            icon="file-tray-outline"
            title={search.trim() ? 'ثبت منتظری با این جستجو پیدا نشد' : 'ثبت سریعی در انتظار نیست'}
            description="هرچه سریع ثبت کنید اینجا می‌ماند تا سر فرصت تبدیلش کنید به نوت یا کار."
          />
        ) : null}

        {openRows.length > 0 ? (
          <>
            <SectionHeader title="در انتظار" count={openCount?.[0]?.total ?? openRows.length} />
            <Column gap="sm">
              {openRows.map(({ capture, patient }) => (
                <CaptureCard
                  key={capture.id}
                  capture={capture}
                  patient={patient}
                  media={byCapture.get(capture.id) ?? NO_MEDIA}
                  onAskPatient={setAsk}
                  generation={generation}
                />
              ))}
            </Column>
          </>
        ) : null}

        {(openCount?.[0]?.total ?? 0) > openRows.length ? (
          <Button label="ثبت‌های بیشتر" variant="ghost" onPress={() => setOpenLimit((n) => n + 50)} />
        ) : null}

        {filedRows.length > 0 ? (
          <>
            <SectionHeader title="تبدیل‌شده‌ها" count={filedCount?.[0]?.total ?? filedRows.length} />
            <Column gap="sm">
              {filedRows.map(({ capture, patient }) => (
                <CaptureCard
                  key={capture.id}
                  capture={capture}
                  patient={patient}
                  media={byCapture.get(capture.id) ?? NO_MEDIA}
                  onAskPatient={setAsk}
                  generation={generation}
                />
              ))}
            </Column>
          </>
        ) : null}
        {(filedCount?.[0]?.total ?? 0) > filedRows.length ? (
          <Button label="تبدیل‌شده‌های بیشتر" variant="ghost" onPress={() => setFiledLimit((n) => n + 20)} />
        ) : null}
      </Column>

      <PickerModal
        visible={ask != null && !patientError}
        title={ask?.purpose === 'note' ? 'نوت برای کدام بیمار؟' : 'این برای کیست؟'}
        items={patientError ? [] : patientItems}
        emptyText={patientsLoading ? 'در حال خواندن…' : 'موردی پیدا نشد'}
        selectedId={ask?.selectedId ?? null}
        onClose={() => setAsk(null)}
        onSelect={(item) => void answerAsk(item.id)}
      />
      <ErrorNotice error={ask ? patientError : undefined} what="فهرست بیماران" onRetry={retryPatients} />
    </Screen>
  );
}
