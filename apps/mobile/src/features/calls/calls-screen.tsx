import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { PickerModal, type PickerItem } from '@/components/picker-modal';
import { Badge, Button, Card, Column, EmptyState, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { VoiceNotePlayer } from '@/components/voice-note-player';
import { writeSetting } from '@/db/settings';
import { useLive } from '@/db/use-live';
import { useSetting } from '@/db/use-setting';
import { patientPickerSublabel } from '@/features/patients/logic';
import { patientListQuery } from '@/features/patients/queries';
import { formatBytes } from '@/lib/format';
import { newId } from '@/lib/ids';
import { formatJalaliDateTime } from '@/lib/jalali';
import { fullName, joinLabels } from '@/lib/persian';
import { useTheme } from '@/theme';

import { chooseCallsFolder, describeShared, listRecordings, pickRecordingFile } from './folder';
import { decodeCallSource, importIdIsValid } from './import-logic';
import { decodeSharedUri } from './logic';
import {
  discardCallImport,
  fileCallRecording,
  pendingCallImportsQuery,
  resumeCallImport,
  type CallRecording,
} from './queries';
import { callsFiled, callsFolderUri } from './settings';

/**
 * Import previously recorded calls, newest first, each one
 * tap from a patient's record.
 *
 * The folder is read again whenever the screen comes into view, so a call
 * that just ended is there when the owner switches back from the dialer.
 */
export function CallsScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const folder = useSetting(callsFolderUri);
  const filed = useSetting(callsFiled).value;
  const filedSet = useMemo(() => new Set(filed), [filed]);

  // undefined: not read yet; null: the folder no longer opens.
  const [recordings, setRecordings] = useState<CallRecording[] | null | undefined>(undefined);
  const [listening, setListening] = useState<string | null>(null);
  const [filing, setFiling] = useState<CallRecording | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const folderUri = folder.value;

  // A recording shared from another app (a call recorder's «اشتراک‌گذاری» → MedOS)
  // arrives as ?shared=<uri>&name=<file name>: go straight to choosing the patient.
  const { shared, name, request } = useLocalSearchParams<{ shared?: string; name?: string; request?: string }>();
  const shareKey = shared ? `${shared}:${request ?? ''}` : null;
  const [handledShare, setHandledShare] = useState<string | null>(null);
  const incoming = useMemo(() => {
    const uri = shared && shareKey !== handledShare ? decodeSharedUri(shared) : null;
    return uri
      ? { ...describeShared(uri, name), importId: request && importIdIsValid(request) ? request : newId() }
      : null;
  }, [shared, name, request, shareKey, handledShare]);
  const pending = filing ?? incoming;
  const latestPending = useRef(pending);
  useEffect(() => {
    latestPending.current = pending;
  }, [pending]);

  /** Done with whatever the picker was showing; a share is answered once. */
  function closePicker(answered: CallRecording | null) {
    setFiling((current) => (current === answered ? null : current));
    setSelectedPatientId(null);
    // A picked file may sit ahead of an unrelated incoming share.
    if (answered === incoming && incoming && shared) {
      setHandledShare(shareKey);
      router.setParams({ shared: undefined, name: undefined, request: undefined });
    }
  }
  useFocusEffect(
    useCallback(() => {
      setRecordings(folderUri ? listRecordings(folderUri) : undefined);
    }, [folderUri]),
  );

  const patients = useLive(patientListQuery());
  const imports = useLive(pendingCallImportsQuery());
  const { data: patientRows } = patients;
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

  async function chooseFolder() {
    const uri = await chooseCallsFolder();
    if (!uri) return;
    await writeSetting(callsFolderUri, uri);
    setRecordings(listRecordings(uri));
  }

  async function pickOne() {
    try {
      const picked = await pickRecordingFile();
      if (picked) setFiling({ ...picked, importId: newId() });
    } catch (e) {
      alertError('فایل باز نشد', e);
    }
  }

  async function file(patientId: string, recording: CallRecording) {
    if (saving.current || patients.error || patients.loading || !patientRows?.some((p) => p.id === patientId)) return;
    saving.current = true;
    setSelectedPatientId(patientId);
    setBusy(true);
    let noteId: string;
    try {
      noteId = await fileCallRecording(patientId, recording);
    } catch (e) {
      alertError('به پرونده اضافه نشد', e);
      return;
    } finally {
      saving.current = false;
      setBusy(false);
    }
    // A navigation failure must not be reported as a failed clinical write.
    try {
      setListening(null);
      // A newer share may arrive during the copy. Do not consume that request.
      if (latestPending.current === recording) closePicker(recording);
      router.push({ pathname: '/patient/[id]/note', params: { id: patientId, noteId } });
    } catch (e) {
      alertError('فایل ذخیره شد؛ نوت باز نشد', e);
    }
  }

  async function resume(id: string, patientId: string) {
    if (saving.current || imports.error) return;
    saving.current = true;
    setBusy(true);
    let noteId: string;
    try {
      noteId = await resumeCallImport(id);
    } catch (e) {
      alertError('ورود فایل کامل نشد', e);
      return;
    } finally {
      saving.current = false;
      setBusy(false);
    }
    try {
      if (latestPending.current?.importId === id) closePicker(latestPending.current);
      router.push({ pathname: '/patient/[id]/note', params: { id: patientId, noteId } });
    } catch (e) {
      alertError('فایل ذخیره شد؛ نوت باز نشد', e);
    }
  }

  function removeIncomplete(id: string) {
    if (saving.current || imports.error) return;
    saving.current = true;
    setBusy(true);
    void discardCallImport(id)
      .then(() => {
        if (latestPending.current?.importId === id) closePicker(latestPending.current);
      })
      .catch((e) => alertError('لغو ورود کامل نشد', e))
      .finally(() => {
        saving.current = false;
        setBusy(false);
      });
  }

  function discard(id: string) {
    if (saving.current || imports.error) return;
    let answered = false;
    Alert.alert(
      'لغو ورود فایل؟',
      'فقط این ورود ناتمام کنار گذاشته می‌شود؛ فایل اصلی و نوت‌های ثبت‌شده حفظ می‌شوند.',
      [
        { text: 'انصراف', style: 'cancel' },
        {
          text: 'لغو ورود',
          style: 'destructive',
          onPress: () => {
            if (answered || saving.current) return;
            answered = true;
            removeIncomplete(id);
          },
        },
      ],
      { cancelable: false },
    );
  }

  if (!folder.loaded) return <Screen>{null}</Screen>;

  return (
    <Screen scroll>
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <ErrorNotice error={imports.error} what="ورودهای ناتمام" onRetry={imports.retry} />
        {(imports.data ?? []).map((item) => {
          let fileName = 'فایل صوتی';
          try {
            fileName = decodeCallSource(item.import.sourceBody).name;
          } catch {
            /* Retry exposes a safe codec error. */
          }
          return (
            <Card key={item.import.id}>
              <Column gap="sm">
                <Text variant="bodyStrong">{item.import.deletedAt ? 'ورود لغو شده' : 'ورود ناتمام'}</Text>
                <Text>{item.firstName ? fullName(item.firstName, item.lastName) : 'بیمار در دسترس نیست'}</Text>
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {fileName}
                </Text>
                <Row gap="sm">
                  {item.import.deletedAt ? null : (
                    <Button
                      label="ادامهٔ ورود"
                      size="sm"
                      disabled={busy || !!imports.error || !item.firstName}
                      onPress={() => void resume(item.import.id, item.import.patientId)}
                    />
                  )}
                  <Button
                    label={item.import.deletedAt ? 'پاک‌کردن کپی ناتمام' : 'لغو ورود'}
                    size="sm"
                    variant="ghost"
                    disabled={busy || !!imports.error}
                    onPress={() => (item.import.deletedAt ? removeIncomplete(item.import.id) : discard(item.import.id))}
                  />
                </Row>
              </Column>
            </Card>
          );
        })}
        {pending ? <ErrorNotice error={patients.error} what="فهرست بیماران" onRetry={patients.retry} /> : null}
        {busy ? (
          <Text variant="caption" color="textMuted">
            در حال وارد کردن فایل…
          </Text>
        ) : null}
        {!folderUri || recordings === null ? (
          <Setup
            lost={recordings === null}
            onChoose={() => void chooseFolder().catch((e) => alertError('پوشه ثبت نشد', e))}
            onPickOne={() => void pickOne()}
            onSummary={() => router.push('/capture')}
          />
        ) : (
          <>
            <SectionHeader
              title="فایل‌های اخیر"
              count={recordings?.length}
              action={
                <Pressable hitSlop={8} onPress={() => void chooseFolder().catch((e) => alertError('پوشه ثبت نشد', e))}>
                  <Text variant="captionStrong" color="primary">
                    تغییر پوشه
                  </Text>
                </Pressable>
              }
            />
            {recordings?.length === 0 ? (
              <EmptyState
                icon="call-outline"
                title="فایل صوتی در این پوشه نیست"
                description="پوشهٔ فایل‌های ضبط‌شده را انتخاب کنید یا یک فایل اضافه کنید."
              />
            ) : null}
            {(recordings ?? []).map((r) => (
              <RecordingCard
                key={r.uri}
                recording={r}
                filed={filedSet.has(r.key)}
                listening={listening === r.uri}
                onListen={() => setListening((current) => (current === r.uri ? null : r.uri))}
                onFile={() => setFiling({ ...r, importId: newId() })}
              />
            ))}
            <Button
              label="افزودن فایل صوتی"
              icon="document-outline"
              variant="ghost"
              full
              onPress={() => void pickOne()}
            />
          </>
        )}
      </Column>

      <PickerModal
        visible={pending != null && !busy && !patients.error}
        title="این تماس با کدام بیمار بود؟"
        items={patients.error ? [] : patientItems}
        selectedId={selectedPatientId}
        emptyText={patients.loading ? 'در حال خواندن…' : 'بیماری نیست. اول بیمار را بسازید.'}
        onClose={() => closePicker(pending)}
        onSelect={(item) => {
          const recording = pending;
          if (recording) void file(item.id, recording);
        }}
      />
    </Screen>
  );
}

/** Import existing recordings without promising a built-in call recorder. */
function Setup({
  lost,
  onChoose,
  onPickOne,
  onSummary,
}: {
  lost: boolean;
  onChoose: () => void;
  onPickOne: () => void;
  /** Without a recording: say what was agreed into a quick capture, right after the call. */
  onSummary: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Card>
      <Column gap="md">
        <Row gap="sm">
          <Ionicons name="call-outline" size={20} color={colors.primary} />
          <Text variant="subheading" style={{ flex: 1 }}>
            {lost ? 'پوشه باز نشد' : 'فایل‌های تماس'}
          </Text>
        </Row>
        <Text variant="body" color="textMuted">
          {lost
            ? 'دسترسی به پوشه از دست رفته است. دوباره انتخابش کنید.'
            : 'فایل صوتی را انتخاب کنید یا از برنامهٔ ضبط، «اشتراک‌گذاری ← MedOS» را بزنید. MedOS خودش تماس را ضبط نمی‌کند.'}
        </Text>
        <Button label="انتخاب پوشه" icon="folder-open-outline" full onPress={onChoose} />
        <Button label="افزودن فایل صوتی" icon="document-outline" variant="ghost" full onPress={onPickOne} />
        {lost ? null : (
          <Button label="خلاصهٔ صوتی بعد از تماس" icon="mic-outline" variant="ghost" full onPress={onSummary} />
        )}
      </Column>
    </Card>
  );
}

function RecordingCard({
  recording,
  filed,
  listening,
  onListen,
  onFile,
}: {
  recording: CallRecording;
  filed: boolean;
  listening: boolean;
  onListen: () => void;
  onFile: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Card>
      <Column gap="sm">
        <Row gap="sm" align="flex-start">
          <Ionicons name="call-outline" size={18} color={colors.primary} style={{ marginTop: 3 }} />
          <Column gap="xxs" style={{ flex: 1 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {recording.who ?? 'تماس بدون نام'}
            </Text>
            <Text variant="caption" color="textMuted">
              {joinLabels([
                recording.recordedAt
                  ? `${recording.timeSource === 'file' ? 'زمان فایل: ' : ''}${formatJalaliDateTime(recording.recordedAt)}`
                  : 'زمان تماس مشخص نیست',
                recording.sizeBytes != null ? formatBytes(recording.sizeBytes) : null,
              ])}
            </Text>
          </Column>
          {filed ? <Badge label="این نام قبلاً وارد شده" tone="neutral" /> : null}
        </Row>
        {listening ? <VoiceNotePlayer uri={recording.uri} caption="پیش‌شنیدن" /> : null}
        <Row gap="sm">
          <Button
            label={listening ? 'بستن' : 'گوش دادن'}
            icon={listening ? 'close' : 'play-outline'}
            variant="ghost"
            size="sm"
            haptic={false}
            onPress={onListen}
          />
          <Button
            label={filed ? 'دوباره به پرونده' : 'به پرونده‌ی بیمار'}
            icon="person-add-outline"
            variant="secondary"
            size="sm"
            onPress={onFile}
          />
        </Row>
      </Column>
    </Card>
  );
}
