import { useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { useAutosaveScope } from '@/components/autosave-scope';
import { alertError } from '@/components/feedback';
import { Button, ChipSelect, Column, Input, Row, Text, Toggle } from '@/components/ui';
import { useNow } from '@/components/use-now';
import type { Task, TaskScheduleDraft } from '@/db/schema';
import { Autosave, type AutosaveState } from '@/lib/autosave';
import { formatJalaliDateTime } from '@/lib/jalali';
import { addDays, formatClock } from '@/lib/time';

import { taskQuery } from './queries';
import { reconcileTaskReminder } from './reminder-queries';
import { initialTaskSchedule, parseTaskSchedule, scheduleDateText, taskScheduleSignature } from './schedule-logic';
import {
  commitTaskSchedule,
  discardTaskScheduleDraft,
  saveTaskScheduleDraft,
  TaskScheduleConflict,
} from './schedule-queries';

export function TaskSchedule({ task }: { task: Task }) {
  const now = useNow();
  const [seed, setSeed] = useState<Task | null>(() => (task.scheduleDraft ? task : null));
  const [generation, setGeneration] = useState(0);
  const opening = useRef(false);
  async function open() {
    if (opening.current) return;
    opening.current = true;
    try {
      const current = (await taskQuery(task.id))[0];
      if (!current) throw new Error('کار در دسترس نیست.');
      setSeed(current);
      setGeneration((value) => value + 1);
    } catch (error) {
      alertError('موعد باز نشد', error);
    } finally {
      opening.current = false;
    }
  }
  const unavailable =
    ((task.reminderEnabled || !!task.notificationId) && task.reminderRevision !== task.reminderAppliedRevision) ||
    (task.status === 'open' &&
      task.reminderEnabled &&
      !!task.dueAt &&
      task.dueAt.getTime() > now &&
      !task.notificationId);
  return (
    <Column gap="xs">
      <Text variant="caption">{task.dueAt ? `موعد: ${formatJalaliDateTime(task.dueAt)}` : 'بدون موعد'}</Text>
      {task.reminderEnabled && task.status === 'open' && task.dueAt && task.dueAt.getTime() > now && !unavailable ? (
        <Text variant="tiny" color="textMuted">
          یادآور تنظیم شده
        </Text>
      ) : null}
      {unavailable ? (
        <Button
          label="هماهنگی اعلان؛ تلاش مجدد"
          size="sm"
          variant="ghost"
          onPress={() => void reconcileTaskReminder(task.id, true)}
        />
      ) : null}
      {seed ? (
        <ScheduleEditor
          key={generation}
          initial={seed}
          onClose={() => setSeed(null)}
          onReload={(row) => {
            setSeed(row);
            setGeneration((value) => value + 1);
          }}
        />
      ) : (
        <Button label="موعد و یادآور" variant="ghost" size="sm" onPress={() => void open()} />
      )}
    </Column>
  );
}

function ScheduleEditor({
  initial,
  onClose,
  onReload,
}: {
  initial: Task;
  onClose: () => void;
  onReload: (task: Task) => void;
}) {
  const now = useNow();
  const scope = useAutosaveScope()!;
  const [fields, setFields] = useState(() => initialTaskSchedule(initial, new Date(now)));
  const latest = useRef(fields);
  const acting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [state, setState] = useState<AutosaveState>({ status: 'idle' });
  const [comparison, setComparison] = useState<Task | null>(null);
  const [persistence] = useState(() => {
    let revision = initial.scheduleDraftRevision;
    return {
      revision: () => revision,
      adopt: (value: number) => {
        revision = value;
      },
      saver: new Autosave<TaskScheduleDraft>({
        write: async (value) => {
          revision = await saveTaskScheduleDraft(initial.id, value, revision);
        },
        onState: setState,
        shouldRetry: (error) => !(error instanceof TaskScheduleConflict),
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
  function change(patch: Partial<TaskScheduleDraft>) {
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
      alertError('موعد ثبت نشد', error);
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }
  async function apply() {
    parseTaskSchedule(latest.current);
    saver.change(latest.current);
    const result = await scope.group.perform(async () => {
      await commitTaskSchedule(initial.id, persistence.revision());
      saver.cancel();
      onClose();
    });
    if (result === 'unsaved') throw new Error('یکی از نوشته‌های صفحه هنوز ذخیره نشده است. دوباره تلاش کنید.');
  }
  return (
    <Column gap="sm">
      <Toggle label="موعد دارد" value={fields.hasDue} disabled={busy} onChange={(hasDue) => change({ hasDue })} />
      {fields.hasDue ? (
        <>
          {/* The usual deadlines in one tap each: a repeat level in an hour or
              six, a job for the morning round, or later in the week. */}
          <ChipSelect<string>
            value={null}
            options={[
              { value: '+1h', label: '۱ ساعت بعد' },
              { value: '+6h', label: '۶ ساعت بعد' },
              { value: 'morning', label: 'فردا ۸ صبح' },
              { value: '+3d', label: '۳ روز بعد' },
            ]}
            onChange={(value) => {
              if (!value) return;
              const at = quickDue(value, new Date(now));
              change({ dateText: scheduleDateText(at), clockText: formatClock(at) });
            }}
          />
          <Input
            label="تاریخ موعد"
            value={fields.dateText}
            onChangeText={(dateText) => change({ dateText })}
            editable={!busy}
            keyboardType="numbers-and-punctuation"
          />
          <Input
            label="ساعت موعد"
            value={fields.clockText}
            onChangeText={(clockText) => change({ clockText })}
            editable={!busy}
            keyboardType="numbers-and-punctuation"
            ltr
          />
          <Toggle
            label="اعلان در موعد"
            value={fields.reminderEnabled}
            disabled={busy}
            onChange={(reminderEnabled) => change({ reminderEnabled })}
          />
        </>
      ) : null}
      {initial.scheduleDraft ? (
        <Text variant="tiny" color="warning">
          این موعد هنوز ذخیره نشده است.
        </Text>
      ) : null}
      <Row gap="sm">
        <Button label="ذخیرهٔ موعد" size="sm" loading={busy} onPress={() => void perform(apply)} />
        <Button
          label="بستن"
          size="sm"
          variant="ghost"
          disabled={busy}
          onPress={() =>
            void perform(async () => {
              if (await saver.flush()) onClose();
            })
          }
        />
      </Row>
      {state.status === 'pending' || state.status === 'writing' ? (
        <Text variant="tiny" color="textMuted">
          در حال ذخیره…
        </Text>
      ) : null}
      {state.status === 'failed' || failed ? (
        <>
          <Button label="ذخیره نشد؛ تلاش دوباره" size="sm" variant="ghost" onPress={() => void saver.flush()} />
          <Button
            label="بررسی نسخهٔ ذخیره‌شده"
            size="sm"
            variant="ghost"
            onPress={() =>
              void perform(async () => {
                setComparison((await taskQuery(initial.id))[0] ?? null);
              })
            }
          />
        </>
      ) : null}
      {comparison ? (
        <Column gap="xs">
          <Text selectable>
            {comparison.scheduleDraft
              ? `${comparison.scheduleDraft.dateText} ${comparison.scheduleDraft.clockText}`
              : comparison.dueAt
                ? formatJalaliDateTime(comparison.dueAt)
                : 'بدون موعد'}
          </Text>
          <Text variant="tiny" color="textMuted">
            {(comparison.scheduleDraft?.hasDue ?? !!comparison.dueAt) ? 'موعد دارد' : 'بدون موعد'}
            {' · '}
            {(comparison.scheduleDraft?.reminderEnabled ?? comparison.reminderEnabled) ? 'اعلان روشن' : 'اعلان خاموش'}
          </Text>
          <Button
            label="نگه‌داشتن نوشتهٔ من"
            size="sm"
            onPress={() =>
              void perform(async () => {
                persistence.adopt(comparison.scheduleDraftRevision);
                latest.current = { ...latest.current, baseSchedule: taskScheduleSignature(comparison) };
                saver.change(latest.current);
                if (await saver.flush()) setComparison(null);
              })
            }
          />
          <Button
            label="بارگذاری نسخهٔ ذخیره‌شده"
            size="sm"
            variant="ghost"
            onPress={() =>
              Alert.alert('جایگزینی نوشتهٔ روی صفحه؟', undefined, [
                { text: 'انصراف', style: 'cancel' },
                {
                  text: 'بارگذاری',
                  onPress: () =>
                    void perform(async () => {
                      const row = (await taskQuery(initial.id))[0];
                      if (row) {
                        saver.cancel();
                        onReload(row);
                      }
                    }),
                },
              ])
            }
          />
        </Column>
      ) : null}
      {/* Only a leftover draft needs throwing away; a fresh edit is left with «بستن». */}
      {initial.scheduleDraft ? (
        <Button
          label="کنارگذاشتن پیش‌نویس موعد"
          size="sm"
          variant="ghost"
          disabled={busy}
          onPress={() =>
            Alert.alert('پیش‌نویس موعد کنار گذاشته شود؟', undefined, [
              { text: 'انصراف', style: 'cancel' },
              {
                text: 'کنار گذاشتن',
                style: 'destructive',
                onPress: () =>
                  void perform(async () => {
                    if (!(await saver.flush())) return;
                    await discardTaskScheduleDraft(initial.id, persistence.revision());
                    saver.cancel();
                    onClose();
                  }),
              },
            ])
          }
        />
      ) : null}
    </Column>
  );
}

function quickDue(choice: string, now: Date): Date {
  if (choice === '+1h') return new Date(now.getTime() + 3_600_000);
  if (choice === '+6h') return new Date(now.getTime() + 6 * 3_600_000);
  if (choice === 'morning') {
    const tomorrow = addDays(now, 1);
    return new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 8, 0);
  }
  return addDays(now, 3);
}
