import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { PickerModal, type PickerItem } from '@/components/picker-modal';
import { Button, Column, EmptyState, Input, Screen, SectionHeader } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { patientListQuery } from '@/features/patients/queries';
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

  const { data: patientRows } = useLive(patientListQuery());
  const patientItems: PickerItem[] = useMemo(
    () =>
      (patientRows ?? []).map((p) => ({
        id: p.id,
        label: fullName(p.firstName, p.lastName),
        sublabel: p.summary,
        keywords: p.searchText,
      })),
    [patientRows],
  );

  async function answerAsk(patientId: string) {
    const pending = ask;
    setAsk(null);
    if (!pending) return;
    try {
      if (pending.purpose === 'note') {
        const noteId = await fileCaptureAsNote(pending.captureId, { patientId });
        router.push({ pathname: '/patient/[id]/note', params: { id: patientId, noteId } });
      } else {
        await updateCapture(pending.captureId, { patientId });
      }
    } catch (e) {
      alertError('انجام نشد', e);
    }
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'صندوق ثبت سریع' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <ErrorNotice
          error={error ?? filedError ?? openCountError ?? filedCountError ?? mediaError}
          what="ثبت‌های سریع"
        />
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

        {!error && openRows.length === 0 && open !== undefined ? (
          <EmptyState
            icon="file-tray-outline"
            title={search.trim() ? 'ثبت منتظری با این جستجو پیدا نشد' : 'چیزی در انتظار نیست'}
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
        visible={ask != null}
        title={ask?.purpose === 'note' ? 'نوت برای کدام بیمار؟' : 'این برای کیست؟'}
        items={patientItems}
        selectedId={ask?.selectedId ?? null}
        onClose={() => setAsk(null)}
        onSelect={(item) => void answerAsk(item.id)}
      />
    </Screen>
  );
}
