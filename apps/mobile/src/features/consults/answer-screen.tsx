import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { EditGate } from '@/components/edit-gate';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Card, Column, Input, Screen, Text } from '@/components/ui';
import { useSaveBeforeLeave } from '@/components/use-save-before-leave';
import type { Consultation } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { patientQuery } from '@/features/patients/queries';
import { Autosave, type AutosaveState } from '@/lib/autosave';
import { fullName } from '@/lib/persian';

import { ConsultDraftConflict, type AnswerDraft } from './answer-drafts';
import { commitConsultAnswerDraft, consultQuery, OPEN_STATUSES, saveConsultAnswerDraft } from './queries';

export function ConsultAnswerScreen() {
  const { consultId = '' } = useLocalSearchParams<{ consultId?: string }>();
  return <AnswerGate key={consultId} id={consultId} />;
}

function AnswerGate({ id }: { id: string }) {
  const { data, error, retry } = useLive(consultQuery(id, true), [id]);
  const [loaded, setLoaded] = useState<{ row: Consultation; generation: number } | null>(null);
  // Keep the editor mounted through later read failures/deletion. Only an explicit
  // reload replaces its text; live query results must never fight the keyboard.
  if (!loaded && data?.[0]) setLoaded({ row: data[0], generation: 0 });
  if (loaded)
    return (
      <AnswerEditor
        key={loaded.generation}
        initial={loaded.row}
        readError={error}
        retryRead={retry}
        onReload={(row) => setLoaded({ row, generation: loaded.generation + 1 })}
      />
    );
  return (
    <EditGate editing rows={data} error={error} onRetry={retry} what="کانسالت">
      {() => null}
    </EditGate>
  );
}

/** One scheduler for both fields, one persisted revision, and an explicit publish. */
export function AnswerEditor({
  initial,
  onReload,
  readError,
  retryRead,
}: {
  initial: Consultation;
  onReload: (row: Consultation) => void;
  readError?: Error;
  retryRead?: () => void;
}) {
  const router = useRouter();
  const {
    data: patientRows,
    error: patientError,
    retry: retryPatient,
  } = useLive(patientQuery(initial.patientId), [initial.patientId]);
  const editable = !initial.deletedAt && OPEN_STATUSES.includes(initial.status);
  const [fields, setFields] = useState<AnswerDraft>({
    response: initial.draftResponse,
    instruction: initial.draftInstruction,
  });
  const latest = useRef(fields);
  const acting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [operationFailed, setOperationFailed] = useState(false);
  const [comparison, setComparison] = useState<Consultation | null>(null);
  const [state, setState] = useState<AutosaveState>({ status: 'idle' });
  const [persistence] = useState(() => {
    // The token belongs to this serialized writer, not to React's render state.
    let revision = initial.draftRevision;
    return {
      getRevision: () => revision,
      chooseRevision: (next: number) => {
        revision = next;
      },
      saver: new Autosave<AnswerDraft>({
        write: async (value) => {
          revision = await saveConsultAnswerDraft(initial.id, value, revision);
        },
        onState: setState,
        shouldRetry: (error) => !(error instanceof ConsultDraftConflict),
      }),
    };
  });
  const saver = persistence.saver;
  useSaveBeforeLeave(() => saver.flush());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void saver.flush();
    });
    return () => {
      sub.remove();
      void saver.flush();
    };
  }, [saver]);

  function update(patch: Partial<AnswerDraft>) {
    if (acting.current || !editable) return;
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setFields(next);
    saver.change(next);
  }

  async function act(action: () => Promise<void>) {
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    try {
      await action();
      setOperationFailed(false);
    } catch (error) {
      setOperationFailed(true);
      alertError('ثبت نشد', error);
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }

  async function publish() {
    if (!latest.current.response.trim()) {
      Alert.alert('پاسخ کانسالت را بنویسید.');
      return;
    }
    if (!(await saver.flush()) || saver.unsaved) return;
    await commitConsultAnswerDraft(initial.id, persistence.getRevision());
    saver.cancel();
    router.back();
  }

  async function compare() {
    // Drain an in-flight write before taking the comparison snapshot, even if it fails.
    await saver.flush();
    const row = (await consultQuery(initial.id, true))[0];
    if (!row) throw new Error('کانسالت پیدا نشد؛ نوشتهٔ روی صفحه را نگه دارید.');
    setComparison(row);
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: 'پاسخ کانسالت' }} />
      <Column gap="md">
        <ErrorNotice error={readError} what="کانسالت" onRetry={retryRead} />
        <ErrorNotice error={patientError} what="بیمار" onRetry={retryPatient} />
        {patientRows?.[0] ? (
          <Text variant="captionStrong">{fullName(patientRows[0].firstName, patientRows[0].lastName)}</Text>
        ) : null}
        <Text variant="heading">{initial.specialty ?? 'کانسالت'}</Text>
        <Text selectable>{initial.reason}</Text>
        {editable ? (
          <>
            <Input
              label="پاسخ"
              multiline
              value={fields.response}
              onChangeText={(response) => update({ response })}
              editable={!busy}
            />
            <Input
              label="دستور پیگیری"
              multiline
              value={fields.instruction}
              onChangeText={(instruction) => update({ instruction })}
              editable={!busy}
            />
            <Text variant="tiny" color="textMuted">
              {state.status === 'failed'
                ? 'پیش‌نویس ذخیره نشد.'
                : state.status === 'pending' || state.status === 'writing'
                  ? 'در حال ذخیره…'
                  : 'پیش‌نویس؛ هنوز پاسخ نهایی ثبت نشده است.'}
            </Text>
            {state.status === 'failed' || operationFailed ? (
              <>
                <Button
                  label="تلاش دوباره"
                  variant="ghost"
                  disabled={busy}
                  onPress={() =>
                    void act(async () => {
                      await saver.flush();
                    })
                  }
                />
                <Button
                  label="مقایسه با نسخهٔ ذخیره‌شده"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => void act(compare)}
                />
              </>
            ) : null}
            <Button label="ثبت پاسخ" icon="checkmark" loading={busy} onPress={() => void act(publish)} />
          </>
        ) : (
          <>
            <Text variant="caption">
              {initial.deletedAt
                ? 'کانسالت حذف‌شده'
                : initial.status === 'answered'
                  ? 'پاسخ ثبت‌شده'
                  : 'کانسالت لغوشده'}
            </Text>
            {initial.response ? <Text selectable>{initial.response}</Text> : null}
            {initial.followUpInstruction ? <Text selectable>{initial.followUpInstruction}</Text> : null}
            {initial.draftResponse || initial.draftInstruction ? (
              <>
                <Text variant="captionStrong">پیش‌نویس ثبت‌نشده</Text>
                <Text selectable>{initial.draftResponse}</Text>
                <Text selectable>{initial.draftInstruction}</Text>
              </>
            ) : null}
          </>
        )}
        {comparison ? (
          <Card>
            <Column gap="sm">
              <Text variant="captionStrong">نسخهٔ ذخیره‌شده</Text>
              <Text selectable>{comparison.response ?? comparison.draftResponse}</Text>
              <Text selectable>{comparison.followUpInstruction ?? comparison.draftInstruction}</Text>
              <Button
                label="بارگذاری این نسخه به‌جای نوشتهٔ من"
                variant="secondary"
                disabled={busy}
                onPress={() => {
                  Alert.alert('جایگزینی نوشتهٔ روی صفحه؟', 'نوشتهٔ ذخیره‌نشدهٔ این صفحه کنار گذاشته می‌شود.', [
                    { text: 'انصراف', style: 'cancel' },
                    {
                      text: 'بارگذاری',
                      onPress: () =>
                        void act(async () => {
                          await saver.flush();
                          const row = (await consultQuery(initial.id, true))[0];
                          if (!row) throw new Error('کانسالت پیدا نشد.');
                          saver.cancel();
                          onReload(row);
                        }),
                    },
                  ]);
                }}
              />
              {!comparison.deletedAt && OPEN_STATUSES.includes(comparison.status) ? (
                <Button
                  label="ذخیرهٔ نوشتهٔ من به‌جای این نسخه"
                  disabled={busy}
                  onPress={() =>
                    void act(async () => {
                      // The displayed revision, not a fresh hidden one, is what the user approved.
                      persistence.chooseRevision(comparison.draftRevision);
                      saver.change(latest.current);
                      if (await saver.flush()) setComparison(null);
                    })
                  }
                />
              ) : null}
            </Column>
          </Card>
        ) : null}
      </Column>
    </Screen>
  );
}
