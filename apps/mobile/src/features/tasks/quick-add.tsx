import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, View } from 'react-native';

import { useAutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, Card, Column, Input, Row, Text } from '@/components/ui';
import type { TaskDraft } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { Autosave, type AutosaveState } from '@/lib/autosave';
import { newId } from '@/lib/ids';

import { commitTaskDraft, saveTaskDraft, TaskDraftConflict, taskDraftQuery } from './draft-queries';

export function QuickAddTask({ patientId, shiftId }: { patientId: string | null; shiftId: string | null }) {
  return <DraftGate key={patientId ?? 'global'} patientId={patientId} shiftId={shiftId} />;
}

function DraftGate({ patientId, shiftId }: { patientId: string | null; shiftId: string | null }) {
  const { data, error } = useLive(taskDraftQuery(patientId), [patientId]);
  const [seed, setSeed] = useState<{ draft: TaskDraft | null; generation: number } | null>(null);
  if (!seed && data) setSeed({ draft: data[0] ?? null, generation: 0 });
  if (seed)
    return (
      <>
        <ErrorNotice error={error} what="پیش‌نویس کار" />
        <TaskDraftEditor
          key={seed.generation}
          initial={seed.draft}
          patientId={patientId}
          shiftId={shiftId}
          onReset={(draft) => setSeed({ draft, generation: seed.generation + 1 })}
        />
      </>
    );
  if (error) return <ErrorNotice error={error} what="پیش‌نویس کار" />;
  return (
    <Text variant="tiny" color="textMuted">
      بارگذاری پیش‌نویس…
    </Text>
  );
}

export function TaskDraftEditor({
  initial,
  patientId,
  shiftId,
  onReset,
}: {
  initial: TaskDraft | null;
  patientId: string | null;
  shiftId: string | null;
  onReset: (draft: TaskDraft | null) => void;
}) {
  const scope = useAutosaveScope()!;
  const [title, setTitle] = useState(initial?.title ?? '');
  const latest = useRef(title);
  const acting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [comparison, setComparison] = useState<{ draft: TaskDraft | null } | null>(null);
  const [state, setState] = useState<AutosaveState>({ status: 'idle' });
  const [persistence] = useState(() => {
    let id = initial?.id ?? newId();
    let revision = initial?.revision ?? 0;
    let target = { patientId, shiftId: initial ? initial.shiftId : shiftId };
    return {
      id: () => id,
      revision: () => revision,
      adopt: (draft: TaskDraft | null) => {
        id = draft?.id ?? newId();
        revision = draft?.revision ?? 0;
        target = { patientId, shiftId: draft ? draft.shiftId : shiftId };
      },
      saver: new Autosave<string>({
        write: async (text) => {
          revision = await saveTaskDraft(id, target, text, revision);
        },
        onState: setState,
        shouldRetry: (error) => !(error instanceof TaskDraftConflict),
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

  function update(text: string) {
    if (acting.current) return;
    latest.current = text;
    setTitle(text);
    saver.change(text);
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
    if (!latest.current.trim()) return;
    if (!(await saver.flush()) || saver.unsaved) return;
    await commitTaskDraft(persistence.id(), persistence.revision());
    saver.cancel();
    onReset(null);
  }
  return (
    <Column gap="xs">
      <Row gap="sm">
        <View style={{ flex: 1 }}>
          <Input
            value={title}
            onChangeText={update}
            editable={!busy}
            placeholder={patientId ? 'کاری برای این بیمار…' : 'مثلاً تماس با رادیولوژی'}
            onSubmitEditing={() => void perform(add)}
            returnKeyType="done"
          />
        </View>
        <Button label="افزودن" icon="add" variant="secondary" loading={busy} onPress={() => void perform(add)} />
      </Row>
      {initial?.shiftId && initial.shiftId !== shiftId ? (
        <Text variant="tiny" color="textMuted">
          پیش‌نویس از شیفت دیگر
        </Text>
      ) : null}
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
                setComparison({ draft: (await taskDraftQuery(patientId))[0] ?? null });
              })
            }
          />
        </>
      ) : null}
      {comparison ? (
        <Card>
          <Column gap="sm">
            <Text selectable>{comparison.draft?.title || 'پیش‌نویس بازی وجود ندارد.'}</Text>
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
                        const row = (await taskDraftQuery(patientId))[0] ?? null;
                        saver.cancel();
                        onReset(row);
                      }),
                  },
                ]);
              }}
            />
          </Column>
        </Card>
      ) : null}
    </Column>
  );
}
