import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from 'expo-router/react-navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, StyleSheet, View } from 'react-native';

import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { PickerModal, type PickerItem } from '@/components/picker-modal';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Column, Input, Row, Screen, SelectField, Text } from '@/components/ui';
import { VoiceRecorder, type Recording } from '@/components/voice-recorder';
import { useLive } from '@/db/use-live';
import { askPhotoSource, attachPhotos } from '@/features/attachments/capture';
import { discardStoppedRecording, persistRecording } from '@/features/attachments/recording-queries';
import { patientPickerSublabel } from '@/features/patients/logic';
import { patientListQuery } from '@/features/patients/queries';
import { Autosave, type AutosaveState } from '@/lib/autosave';
import { assertDatasetWrite, withDatasetWrite } from '@/lib/dataset-write';
import { withFileJob } from '@/lib/file-work';
import { fullName } from '@/lib/persian';
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
  return (
    <AutosaveScope>
      <CaptureForm />
    </AutosaveScope>
  );
}

function CaptureForm() {
  const router = useRouter();
  const navigation = useNavigation();
  const scope = useAutosaveScope()!;
  const { generation, stale } = useDatasetIntent();
  const { spacing } = useTheme();
  const params = useLocalSearchParams<{ patientId?: string }>();

  // The writer holds both the newest values and the row id. Timers, the
  // recorder and the camera all read it from callbacks, where React state
  // would be a stale closure.
  const [writer] = useState(() => new CaptureWriter({ patientId: params.patientId ?? null }, generation));
  const [text, setText] = useState('');
  const [patientId, setPatientId] = useState<string | null>(params.patientId ?? null);
  const [picking, setPicking] = useState(false);
  const [autosave, setAutosave] = useState<AutosaveState>({ status: 'idle' });
  const [busy, setBusy] = useState(false);
  const acting = useRef(false);
  const voiceTarget = useRef<string | undefined>(undefined);

  const saver = useMemo(
    () => new Autosave<CaptureFields>({ write: (value) => writer.write(value), onState: setAutosave, generation }),
    [writer, generation],
  );

  useEffect(() => scope.group.register(saver), [scope, saver]);

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
      void saver
        .flush()
        .then((saved) => (saved && !scope.isAbandoned() ? writer.discardIfEmpty() : undefined))
        .catch((e) => alertError('ثبت نشد', e));
    };
  }, [saver, writer, scope]);

  const { data: patientRows, error: patientError, retry: retryPatients } = useLive(patientListQuery());
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
  const patientLabel = patientItems.find((p) => p.id === patientId)?.label ?? null;
  // A replacement may reuse this patient ID for a different identity. Keep
  // the old label with the retained form rather than relabeling its intent.
  const [originalPatientLabel, setOriginalPatientLabel] = useState(patientLabel);
  if (!stale && originalPatientLabel !== patientLabel) setOriginalPatientLabel(patientLabel);

  async function onRecorded(recording: Recording) {
    await withDatasetWrite(generation, () =>
      withFileJob(async () => {
        const id = await writer.ensure();
        voiceTarget.current = id;
        if (!(await saver.flush())) throw new Error('متن یا بیمار ثبت سریع هنوز ذخیره نشده است.');
        // persistRecording reserves the durable operation before native IO. The
        // recorder keeps its stopped source until this entire callback acknowledges.
        await persistRecording(recording, { entityType: 'capture', entityId: id }, new Date());
        // Typing may continue while native copying is in flight. A close must
        // acknowledge those newer words too, without recursively flushing the recorder.
        if (!(await saver.flush())) throw new Error('وویس ذخیره شد، اما متن جدید هنوز ذخیره نشده است.');
      }),
    );
  }

  async function onDiscarded(recording: Recording) {
    await withDatasetWrite(generation, async () => {
      if (voiceTarget.current)
        await discardStoppedRecording(recording, { entityType: 'capture', entityId: voiceTarget.current }, new Date());
    });
  }

  function closeAfterSave() {
    assertDatasetWrite(generation);
    if (navigation.isFocused()) router.back();
  }

  function addPhoto() {
    askPhotoSource((source) => {
      void (async () => {
        if (acting.current) return;
        acting.current = true;
        setBusy(true);
        try {
          await withDatasetWrite(generation, async () => {
            const id = await writer.ensure({ kind: 'photo' });
            if (!(await saver.flush())) throw new Error('متن یا بیمار ثبت سریع هنوز ذخیره نشده است.');
            const added = await attachPhotos({
              source,
              entityType: 'capture',
              entityId: id,
              patientId: writer.current.patientId,
              kind: 'photo',
            });
            if (added.length > 0) {
              await updateCapture(id, { kind: 'photo' });
              if (await saver.flush()) closeAfterSave();
            }
          });
        } catch (e) {
          alertError('عکس ذخیره نشد', e);
        } finally {
          acting.current = false;
          setBusy(false);
        }
      })();
    });
  }

  async function done() {
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    try {
      const stored = await scope.canLeave();
      // Only leave if the words reached storage; a failed write keeps its
      // value and retries, and going back now would hide that.
      if (stored) closeAfterSave();
    } catch (e) {
      alertError('ثبت نشد', e);
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }

  function closeStale() {
    Alert.alert('بستن فرم قبلی', 'نوشتهٔ روی این صفحه دور ریخته می‌شود؛ اطلاعات بازگردانی‌شده تغییر نمی‌کند.', [
      { text: 'ادامهٔ مرور', style: 'cancel' },
      {
        text: 'بستن فرم',
        style: 'destructive',
        onPress: () => {
          if (!navigation.isFocused()) return;
          saver.cancel();
          scope.abandonStale();
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: 'ثبت سریع' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <Input
          value={text}
          onChangeText={(v) => update({ text: v })}
          placeholder="هرچه هست بنویسید؛ بعداً سر فرصت جایش را مشخص کنید."
          multiline
          editable={!stale}
          autoFocus
        />

        <Row gap="sm">
          <View style={styles.grow}>
            {!stale && (
              <VoiceRecorder
                label="ضبط وویس"
                onRecorded={onRecorded}
                onDiscarded={onDiscarded}
                onSaved={() => {
                  if (!acting.current) closeAfterSave();
                }}
              />
            )}
          </View>
          <Button
            label="عکس"
            icon="camera-outline"
            variant="secondary"
            onPress={addPhoto}
            loading={busy}
            disabled={stale}
          />
        </Row>

        <ErrorNotice error={patientError} what="بیماران" onRetry={retryPatients} />
        <SelectField
          label="بیمار (اختیاری)"
          value={stale ? originalPatientLabel : patientLabel}
          placeholder="اگر معلوم است برای چه کسی است"
          disabled={stale}
          onPress={() => void scope.perform(() => setPicking(true))}
          onClear={patientId ? () => void scope.perform(() => update({ patientId: null })) : undefined}
        />

        <Button
          label={stale ? 'بستن فرم قبلی' : 'ثبت'}
          icon="checkmark"
          onPress={() => (stale ? closeStale() : void done())}
          loading={busy}
          disabled={!stale && text.trim().length === 0}
          full
        />

        <Text variant="tiny" color="textFaint">
          {stale
            ? 'اطلاعات از بکاپ جایگزین شده؛ نوشتهٔ این فرم باقی مانده و ذخیره نمی‌شود.'
            : autosave.status === 'failed'
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
          void scope.perform(() => {
            setPicking(false);
            update({ patientId: item.id });
          });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
