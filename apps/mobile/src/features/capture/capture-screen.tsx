import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { alertError } from '@/components/feedback';
import { PickerModal, type PickerItem } from '@/components/picker-modal';
import { Button, Column, Input, Row, Screen, SelectField, Text } from '@/components/ui';
import { VoiceRecorder, type Recording } from '@/components/voice-recorder';
import { useLive } from '@/db/use-live';
import { askPhotoSource, attachPhotos } from '@/features/attachments/capture';
import { addAttachment } from '@/features/attachments/queries';
import { patientListQuery } from '@/features/patients/queries';
import { Autosave, type AutosaveState } from '@/lib/autosave';
import { fullName } from '@/lib/persian';
import { extensionOf, storeFile } from '@/platform/media';
import { useTheme } from '@/theme';

import { updateCapture } from './queries';
import { CaptureWriter, type CaptureFields } from './writer';

/**
 * Write it down now, decide later.
 *
 * The one rule of this screen is that it never asks a question. No patient is
 * required, no type, no title — those are what stop a thing from being written
 * at all when it is said in a corridor. Filing happens in the inbox, sitting
 * down.
 *
 * The row is written the moment there is something to lose and kept up to date
 * a second or two behind the keyboard, so leaving by any route — back, the
 * home button, a call — keeps the words. A row that ends up with nothing in it
 * is dropped again on the way out.
 */
export function CaptureScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const params = useLocalSearchParams<{ patientId?: string }>();

  // The writer holds both the newest values and the row id. Timers, the
  // recorder and the camera all read it from callbacks, where React state
  // would be a stale closure.
  const [writer] = useState(() => new CaptureWriter({ patientId: params.patientId ?? null }));
  const [text, setText] = useState('');
  const [patientId, setPatientId] = useState<string | null>(params.patientId ?? null);
  const [picking, setPicking] = useState(false);
  const [autosave, setAutosave] = useState<AutosaveState>({ status: 'idle' });
  const [busy, setBusy] = useState(false);

  const saver = useMemo(
    () => new Autosave<CaptureFields>({ write: (value) => writer.write(value), onState: setAutosave }),
    [writer],
  );

  function update(patch: Partial<CaptureFields>) {
    const next = { ...writer.current, ...patch };
    writer.set(next);
    if (patch.text !== undefined) setText(patch.text);
    if (patch.patientId !== undefined) setPatientId(patch.patientId);
    saver.change(next);
  }

  // Leaving the screen and the app leaving the foreground are both moments to
  // write rather than schedule. On the way out an untouched row is dropped, so
  // opening this screen by accident does not leave a blank line in the inbox.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void saver.flush();
    });
    return () => {
      sub.remove();
      void saver.flush().then(() => writer.discardIfEmpty());
    };
  }, [saver, writer]);

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
  const patientLabel = patientItems.find((p) => p.id === patientId)?.label ?? null;

  async function onRecorded(recording: Recording) {
    try {
      // Stored before it is attached: a file still in the recorder's cache is
      // not a recording, whatever the screen shows.
      const stored = await storeFile(recording.uri, extensionOf(recording.uri, 'm4a'), { move: true });
      const id = await writer.ensure({ kind: 'voice' });
      await addAttachment({
        entityType: 'capture',
        entityId: id,
        patientId: writer.current.patientId,
        kind: 'voice',
        relativePath: stored.relativePath,
        sizeBytes: stored.sizeBytes,
        mimeType: 'audio/mp4',
        durationMs: recording.durationMs,
      });
      await updateCapture(id, { kind: 'voice' });
      router.back();
    } catch (e) {
      alertError('وویس ذخیره نشد', e);
    }
  }

  function addPhoto() {
    askPhotoSource((source) => {
      void (async () => {
        setBusy(true);
        try {
          const id = await writer.ensure({ kind: 'photo' });
          const added = await attachPhotos({
            source,
            entityType: 'capture',
            entityId: id,
            patientId: writer.current.patientId,
            kind: 'photo',
          });
          if (added.length > 0) {
            await updateCapture(id, { kind: 'photo' });
            router.back();
          }
        } catch (e) {
          alertError('عکس ذخیره نشد', e);
        } finally {
          setBusy(false);
        }
      })();
    });
  }

  async function done() {
    setBusy(true);
    try {
      const stored = await saver.flush();
      // Only leave if the words reached storage; a failed write keeps its
      // value and retries, and going back now would hide that.
      if (stored) router.back();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'ثبت سریع' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <Input
          value={text}
          onChangeText={(v) => update({ text: v })}
          placeholder="هرچه هست بنویسید؛ بعداً سر فرصت جایش را مشخص کنید."
          multiline
          autoFocus
        />

        <Row gap="sm">
          <View style={styles.grow}>
            <VoiceRecorder label="ضبط وویس" onRecorded={(rec) => void onRecorded(rec)} />
          </View>
          <Button label="عکس" icon="camera-outline" variant="secondary" onPress={addPhoto} loading={busy} />
        </Row>

        <SelectField
          label="بیمار (اختیاری)"
          value={patientLabel}
          placeholder="اگر معلوم است برای چه کسی است"
          onPress={() => setPicking(true)}
          onClear={patientId ? () => update({ patientId: null }) : undefined}
        />

        <Button
          label="ثبت"
          icon="checkmark"
          onPress={() => void done()}
          loading={busy}
          disabled={text.trim().length === 0}
          full
        />

        <Text variant="tiny" color="textFaint">
          {autosave.status === 'failed'
            ? 'هنوز ذخیره نشده — دوباره تلاش می‌شود.'
            : autosave.status === 'pending' || autosave.status === 'writing'
              ? 'در حال ذخیره…'
              : 'نوشته‌ها خودکار نگه داشته می‌شوند.'}
        </Text>
      </Column>

      <PickerModal
        visible={picking}
        title="این برای کیست؟"
        items={patientItems}
        selectedId={patientId}
        onClose={() => setPicking(false)}
        onSelect={(item) => {
          setPicking(false);
          update({ patientId: item.id });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
