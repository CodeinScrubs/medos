import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable } from 'react-native';

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
import { formatJalaliDateTime } from '@/lib/jalali';
import { fullName, joinLabels } from '@/lib/persian';
import { useTheme } from '@/theme';

import { chooseCallsFolder, describeShared, listRecordings, pickRecordingFile } from './folder';
import { decodeSharedUri } from './logic';
import { fileCallRecording, type CallRecording } from './queries';
import { callsFiled, callsFolderUri } from './settings';

/**
 * «ضبط تماس‌ها»: the calls the phone's dialer recorded, newest first, each one
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
  const { shared, name } = useLocalSearchParams<{ shared?: string; name?: string }>();
  const [handledShare, setHandledShare] = useState<string | null>(null);
  const incoming = useMemo(() => {
    const uri = shared && shared !== handledShare ? decodeSharedUri(shared) : null;
    return uri ? describeShared(uri, name) : null;
  }, [shared, name, handledShare]);
  const pending = filing ?? incoming;
  const latestPending = useRef(pending);
  useEffect(() => {
    latestPending.current = pending;
  }, [pending]);

  /** Done with whatever the picker was showing; a share is answered once. */
  function closePicker() {
    setFiling(null);
    setSelectedPatientId(null);
    if (incoming && shared) {
      setHandledShare(shared);
      router.setParams({ shared: undefined, name: undefined });
    }
  }
  useFocusEffect(
    useCallback(() => {
      setRecordings(folderUri ? listRecordings(folderUri) : undefined);
    }, [folderUri]),
  );

  const patients = useLive(patientListQuery());
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
      if (picked) setFiling(picked);
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
      if (latestPending.current === recording) closePicker();
      router.push({ pathname: '/patient/[id]/note', params: { id: patientId, noteId } });
    } catch (e) {
      alertError('فایل ذخیره شد؛ نوت باز نشد', e);
    }
  }

  if (!folder.loaded) return <Screen>{null}</Screen>;

  return (
    <Screen scroll>
      <Column gap="md" style={{ paddingTop: spacing.md }}>
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
              title="ضبط‌های اخیر"
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
                title="هنوز ضبطی در این پوشه نیست"
                description="بعد از تماس، ضبطِ اپ «تلفن» اینجا می‌آید."
              />
            ) : null}
            {(recordings ?? []).map((r) => (
              <RecordingCard
                key={r.key}
                recording={r}
                filed={filedSet.has(r.key)}
                listening={listening === r.key}
                onListen={() => setListening((current) => (current === r.key ? null : r.key))}
                onFile={() => setFiling(r)}
              />
            ))}
            <Button
              label="یک فایل صوتی دیگر"
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
        onClose={closePicker}
        onSelect={(item) => {
          const recording = pending;
          if (recording) void file(item.id, recording);
        }}
      />
    </Screen>
  );
}

/**
 * How recordings get here, and what to do without one. The dialer's own
 * recording is region-locked: on the owner's phone (a Gulf firmware) Samsung
 * removed it, which is why the text does not promise it.
 */
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
            {lost ? 'پوشه‌ی ضبط تماس‌ها باز نشد' : 'ضبط تماس'}
          </Text>
        </Row>
        <Text variant="body" color="textMuted">
          {lost
            ? 'دسترسی به پوشه از دست رفته (مثلاً بعد از بازگردانی روی گوشی دیگر). دوباره انتخابش کنید.'
            : 'اندروید ضبط تماس را فقط به اپ «تلفن» گوشی یا به اپ‌های ضبط تماس می‌دهد؛ MedOS خودش تماس را ضبط نمی‌کند، ضبط‌های آن‌ها را به پرونده می‌آورد. اگر اپ «تلفن» گوشی «ضبط تماس‌ها» دارد، روشنش کنید (ضبط‌ها در Recordings/Call می‌آیند)؛ اگر ندارد — سامسونگ آن را برای بعضی کشورها برداشته — یک اپ ضبط تماس لازم است. بعد از اولین تماسِ ضبط‌شده، پوشه‌ی ضبط‌ها را اینجا انتخاب کنید. اگر اپ ضبط، ضبط‌ها را پیش خودش نگه می‌دارد (مثل Cube ACR)، هر ضبط را از همان اپ «اشتراک‌گذاری» کنید و MedOS را انتخاب کنید.'}
        </Text>
        {lost ? null : (
          <Text variant="caption" color="textFaint">
            ضبط مکالمه ممکن است به اطلاع یا رضایت طرف مقابل نیاز داشته باشد.
          </Text>
        )}
        <Button label="انتخاب پوشه‌ی ضبط تماس‌ها" icon="folder-open-outline" full onPress={onChoose} />
        <Button label="یک فایل صوتی را انتخاب کنید" icon="document-outline" variant="ghost" full onPress={onPickOne} />
        {lost ? null : (
          <Button
            label="بدون ضبط: خلاصه‌ی صوتی بعد از تماس"
            icon="mic-outline"
            variant="ghost"
            full
            onPress={onSummary}
          />
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
          {filed ? <Badge label="در پرونده" tone="success" /> : null}
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
