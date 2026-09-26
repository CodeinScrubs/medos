import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable } from 'react-native';

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

import { chooseCallsFolder, listRecordings, pickRecordingFile } from './folder';
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

  const folderUri = folder.value;
  useFocusEffect(
    useCallback(() => {
      setRecordings(folderUri ? listRecordings(folderUri) : undefined);
    }, [folderUri]),
  );

  const { data: patientRows } = useLive(patientListQuery());
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
    setBusy(true);
    try {
      const noteId = await fileCallRecording(patientId, recording);
      setListening(null);
      // The note is empty: what was said is written now, while it is fresh.
      router.push({ pathname: '/patient/[id]/note', params: { id: patientId, noteId } });
    } catch (e) {
      alertError('به پرونده اضافه نشد', e);
    } finally {
      setBusy(false);
    }
  }

  if (!folder.loaded) return <Screen>{null}</Screen>;

  return (
    <Screen scroll>
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {!folderUri || recordings === null ? (
          <Setup
            lost={recordings === null}
            onChoose={() => void chooseFolder()}
            onPickOne={() => void pickOne()}
            onSummary={() => router.push('/capture')}
          />
        ) : (
          <>
            <SectionHeader
              title="ضبط‌های اخیر"
              count={recordings?.length}
              action={
                <Pressable hitSlop={8} onPress={() => void chooseFolder()}>
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
        visible={filing != null && !busy}
        title="این تماس با کدام بیمار بود؟"
        items={patientItems}
        emptyText="بیماری نیست. اول بیمار را بسازید."
        onClose={() => setFiling(null)}
        onSelect={(item) => {
          const recording = filing;
          setFiling(null);
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
            {lost ? 'پوشه‌ی ضبط تماس‌ها باز نشد' : 'ضبط تماس، با اپ «تلفن»'}
          </Text>
        </Row>
        <Text variant="body" color="textMuted">
          {lost
            ? 'دسترسی به پوشه از دست رفته (مثلاً بعد از بازگردانی روی گوشی دیگر). دوباره انتخابش کنید.'
            : 'اندروید ضبط تماس را فقط به اپ «تلفن» گوشی یا به اپ‌های ضبط تماس می‌دهد؛ MedOS خودش تماس را ضبط نمی‌کند، ضبط‌های آن‌ها را به پرونده می‌آورد. اگر اپ «تلفن» گوشی «ضبط تماس‌ها» دارد، روشنش کنید (ضبط‌ها در Recordings/Call می‌آیند)؛ اگر ندارد — سامسونگ آن را برای بعضی کشورها برداشته — یک اپ ضبط تماس لازم است. بعد از اولین تماسِ ضبط‌شده، پوشه‌ی ضبط‌ها را اینجا انتخاب کنید.'}
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
                recording.recordedAt.getTime() > 0 ? formatJalaliDateTime(recording.recordedAt) : null,
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
