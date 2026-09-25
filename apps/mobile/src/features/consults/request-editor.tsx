import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, View } from 'react-native';

import { useAutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, Card, Column, Input, Row, Text } from '@/components/ui';
import type { ConsultRequestDraft } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { Autosave, type AutosaveState } from '@/lib/autosave';
import { newId } from '@/lib/ids';

import {
  commitRequestDraft,
  RequestDraftConflict,
  requestDraftQuery,
  saveRequestDraft,
  type RequestDraftFields,
} from './request-drafts';

/**
 * The new-consult form. It stays folded away until asked for — most visits to
 * a record are not to write a consult — except when an unfinished question is
 * waiting in a draft, which is shown straight away.
 */
export function ConsultRequestEditor({
  patientId,
  open,
  onDone,
}: {
  patientId: string;
  open: boolean;
  onDone: () => void;
}) {
  return <DraftGate key={patientId} patientId={patientId} open={open} onDone={onDone} />;
}

function DraftGate({ patientId, open, onDone }: { patientId: string; open: boolean; onDone: () => void }) {
  const { data, error } = useLive(requestDraftQuery(patientId), [patientId]);
  const [seed, setSeed] = useState<{ draft: ConsultRequestDraft | null; generation: number } | null>(null);
  if (!seed && data) setSeed({ draft: data[0] ?? null, generation: 0 });
  if (seed) {
    const waiting = Boolean(seed.draft && (seed.draft.specialty || seed.draft.reason));
    if (!open && !waiting) return <ErrorNotice error={error} what="پیش‌نویس کانسالت" />;
    return (
      <>
        <ErrorNotice error={error} what="پیش‌نویس کانسالت" />
        <RequestDraftEditor
          key={seed.generation}
          initial={seed.draft}
          patientId={patientId}
          autoFocus={open && !waiting}
          onReset={(draft) => {
            setSeed({ draft, generation: seed.generation + 1 });
            if (!draft) onDone();
          }}
        />
      </>
    );
  }
  if (error) return <ErrorNotice error={error} what="پیش‌نویس کانسالت" />;
  return open ? (
    <Text variant="tiny" color="textMuted">
      بارگذاری پیش‌نویس…
    </Text>
  ) : null;
}

export function RequestDraftEditor({
  initial,
  patientId,
  autoFocus = false,
  onReset,
}: {
  initial: ConsultRequestDraft | null;
  patientId: string;
  autoFocus?: boolean;
  onReset: (draft: ConsultRequestDraft | null) => void;
}) {
  const scope = useAutosaveScope()!;
  const [fields, setFields] = useState<RequestDraftFields>({
    specialty: initial?.specialty ?? '',
    reason: initial?.reason ?? '',
  });
  const latest = useRef(fields);
  const acting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [comparison, setComparison] = useState<{ draft: ConsultRequestDraft | null } | null>(null);
  const [state, setState] = useState<AutosaveState>({ status: 'idle' });
  const [persistence] = useState(() => {
    let id = initial?.id ?? newId();
    let revision = initial?.revision ?? 0;
    return {
      id: () => id,
      revision: () => revision,
      adopt: (draft: ConsultRequestDraft | null) => {
        id = draft?.id ?? newId();
        revision = draft?.revision ?? 0;
      },
      saver: new Autosave<RequestDraftFields>({
        write: async (value) => {
          revision = await saveRequestDraft(id, patientId, value, revision);
        },
        onState: setState,
        shouldRetry: (error) => !(error instanceof RequestDraftConflict),
      }),
    };
  });
  const saver = persistence.saver;
  useEffect(() => scope.group.register(saver), [scope, saver]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void saver.flush();
    });
    return () => {
      sub.remove();
      void saver.flush();
    };
  }, [saver]);

  function update(patch: Partial<RequestDraftFields>) {
    if (acting.current) return;
    latest.current = { ...latest.current, ...patch };
    setFields(latest.current);
    saver.change(latest.current);
  }
  async function perform(action: () => Promise<void>) {
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    try {
      await action();
      setFailed(false);
    } catch (error) {
      setFailed(true);
      alertError('ثبت نشد', error);
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }
  async function add() {
    if (!latest.current.reason.trim()) {
      Alert.alert('سؤال کانسالت را بنویسید');
      return;
    }
    if (!(await saver.flush()) || saver.unsaved) return;
    await commitRequestDraft(persistence.id(), persistence.revision());
    saver.cancel();
    onReset(null);
  }
  return (
    <Card tone="alt">
      <Column gap="sm">
        <Row gap="sm">
          <View style={{ width: 110 }}>
            <Input
              value={fields.specialty}
              onChangeText={(specialty) => update({ specialty })}
              placeholder="سرویس"
              editable={!busy}
              autoFocus={autoFocus}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              value={fields.reason}
              onChangeText={(reason) => update({ reason })}
              placeholder="سؤال کانسالت"
              editable={!busy}
            />
          </View>
        </Row>
        <Button label="ثبت کانسالت" icon="add" variant="secondary" loading={busy} onPress={() => void perform(add)} />
        {state.status === 'pending' || state.status === 'writing' ? (
          <Text variant="tiny" color="textMuted">
            در حال ذخیره…
          </Text>
        ) : null}
        {state.status === 'failed' || failed ? (
          <>
            <Button
              label="ذخیره نشد؛ تلاش دوباره"
              variant="ghost"
              size="sm"
              disabled={busy}
              onPress={() =>
                void perform(async () => {
                  await saver.flush();
                })
              }
            />
            <Button
              label="بررسی پیش‌نویس ذخیره‌شده"
              variant="ghost"
              size="sm"
              disabled={busy}
              onPress={() =>
                void perform(async () => {
                  await saver.flush();
                  setComparison({ draft: (await requestDraftQuery(patientId))[0] ?? null });
                })
              }
            />
          </>
        ) : null}
        {comparison ? (
          <Column gap="sm">
            <Text selectable>
              {comparison.draft
                ? [comparison.draft.specialty, comparison.draft.reason].filter(Boolean).join('\n') ||
                  'پیش‌نویس خالی است.'
                : 'پیش‌نویس بازی وجود ندارد.'}
            </Text>
            <Button
              label="نگه‌داشتن نوشتهٔ من"
              size="sm"
              disabled={busy}
              onPress={() =>
                void perform(async () => {
                  // Only the displayed revision may be replaced; another change still conflicts.
                  persistence.adopt(comparison.draft);
                  saver.change(latest.current);
                  if (await saver.flush()) setComparison(null);
                })
              }
            />
            <Button
              label="بارگذاری نسخهٔ ذخیره‌شده"
              variant="ghost"
              size="sm"
              disabled={busy}
              onPress={() => {
                Alert.alert('جایگزینی نوشتهٔ روی صفحه؟', 'نوشتهٔ ذخیره‌نشدهٔ این صفحه کنار گذاشته می‌شود.', [
                  { text: 'انصراف', style: 'cancel' },
                  {
                    text: 'بارگذاری',
                    onPress: () =>
                      void perform(async () => {
                        await saver.flush();
                        const row = (await requestDraftQuery(patientId))[0] ?? null;
                        saver.cancel();
                        onReset(row);
                      }),
                  },
                ]);
              }}
            />
          </Column>
        ) : null}
      </Column>
    </Card>
  );
}
