import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { alertError } from '@/components/feedback';
import { Button, Input, Toggle } from '@/components/ui';
import { restoreDatabase } from '@/db/client';
import { tasks } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { DatasetBusyError, DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';
import * as notifications from '@/platform/notifications';
import { useTestDatabase } from '@/test/db-client';
import { resetNotifications, scheduled } from '@/test/mocks/notifications';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { createTask } from './queries';
import { taskReminderId } from './reminder-queries';
import { TaskSchedule } from './schedule-editor';
import { initialTaskSchedule, scheduleDateText } from './schedule-logic';
import { saveTaskScheduleDraft } from './schedule-queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/feedback', () => ({
  alertError: jest.fn(),
  notify: jest.requireActual<typeof import('@/components/feedback')>('@/components/feedback').notify,
}));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: () => {} }));
jest.mock('@/components/use-now', () => ({ useNow: () => new Date('2026-09-24T12:00:00Z').getTime() }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  Input: 'Input',
  Row: 'Row',
  Text: 'Text',
  Toggle: 'Toggle',
}));
let t: TestDatabase;
let tree: ReactTestRenderer | undefined;
let scope: NonNullable<ReturnType<typeof useAutosaveScope>>;
let snapshotCounter = 0;
const future = new Date(2030, 6, 12, 18, 0);
const current = () => t.db.select().from(tasks).get()!;
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
const input = (label: string) => tree!.root.findAllByType(Input).find((node) => node.props.label === label)!;
const toggle = (label: string) => tree!.root.findAllByType(Toggle).find((node) => node.props.label === label)!;
async function settle() {
  for (let i = 0; i < 35; i++) await Promise.resolve();
}
async function render() {
  await act(async () => {
    tree = create(
      <AutosaveScope>
        <CaptureScope />
        <TaskSchedule task={current()} />
      </AutosaveScope>,
    );
  });
}
function CaptureScope() {
  const value = useAutosaveScope()!;
  useEffect(() => {
    scope = value;
  }, [value]);
  return null;
}
function snapshot() {
  const path = `/schedule-intent-${++snapshotCounter}.db`;
  t.sqlite.exec(`VACUUM INTO '${path}'`);
  return () => {
    const replacement = reserveDatasetReplacement();
    const trusted = restoreDatabase(replacement);
    try {
      trusted.sqlite.execSync('PRAGMA foreign_keys = OFF');
      trusted.sqlite.execSync(`ATTACH DATABASE '${path}' AS restore_src`);
      try {
        importTables(trusted.sqlite);
      } finally {
        trusted.sqlite.execSync('DETACH DATABASE restore_src');
        trusted.sqlite.execSync('PRAGMA foreign_keys = ON');
      }
      replacement.committed();
    } finally {
      replacement.release();
    }
  };
}
async function seedDraft() {
  await saveTaskScheduleDraft(
    current().id,
    { ...initialTaskSchedule(current(), future), hasDue: true, dateText: scheduleDateText(future), clockText: '18:00' },
    current().scheduleDraftRevision,
  );
}
async function invoke(onPress: (() => void) | undefined) {
  await act(async () => {
    onPress!();
    await settle();
  });
}
async function click(label: string) {
  await act(async () => {
    button(label).props.onPress();
    await settle();
  });
}
async function type(label: string, text: string) {
  await act(async () => {
    input(label).props.onChangeText(text);
    jest.advanceTimersByTime(850);
    await settle();
  });
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  resetNotifications();
  await createTask({ title: 'Review' });
  jest.mocked(alertError).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.useFakeTimers();
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
  tree = undefined;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('task schedule editor', () => {
  it('refuses a late opening from an already retained schedule widget after real restore', async () => {
    const restore = snapshot();
    await render();
    const original = current();
    await act(async () => restore());
    await click('موعد و یادآور');
    expect(tree!.root.findAllByType(Toggle)).toHaveLength(0);
    expect(current()).toEqual(original);
    expect(alertError).toHaveBeenCalledWith('موعد باز نشد', expect.any(DatasetChangedError));
  });

  it('refuses publication by a schedule editor mounted late inside a retained stale scope', async () => {
    await seedDraft();
    const restore = snapshot();
    const original = current();
    await act(async () => {
      tree = create(
        <AutosaveScope>
          <CaptureScope />
        </AutosaveScope>,
      );
    });
    await act(async () => restore());
    await act(async () => {
      tree!.update(
        <AutosaveScope>
          <CaptureScope />
          <TaskSchedule task={current()} />
        </AutosaveScope>,
      );
    });
    await act(async () => input('ساعت موعد').props.onChangeText('19:00'));
    await click('ذخیرهٔ موعد');
    expect(current()).toEqual(original);
    expect(input('ساعت موعد').props.value).toBe('19:00');
    expect(alertError).toHaveBeenCalledWith('موعد ثبت نشد', expect.any(DatasetChangedError));
  });

  it('retains a late schedule draft and refuses direct autosaver flush in the stale retained scope', async () => {
    await seedDraft();
    const restore = snapshot();
    const original = current();
    await act(async () => {
      tree = create(
        <AutosaveScope>
          <CaptureScope />
        </AutosaveScope>,
      );
    });
    const register = jest.spyOn(scope.group, 'register');
    await act(async () => restore());
    await act(async () => {
      tree!.update(
        <AutosaveScope>
          <CaptureScope />
          <TaskSchedule task={current()} />
        </AutosaveScope>,
      );
    });
    await act(async () => input('ساعت موعد').props.onChangeText('19:'));
    const saver = register.mock.calls[0]![0];
    let saved: boolean | undefined;
    await act(async () => {
      saved = await saver.flush();
    });
    expect(saved).toBe(false);
    expect(saver.unsaved).toBe(true);
    expect(current()).toEqual(original);
    expect(input('ساعت موعد').props.value).toBe('19:');
  });

  it('rejects a held discard confirmation after real same-ID restore without erasing the draft', async () => {
    await seedDraft();
    const restore = snapshot();
    const original = current();
    await render();
    await click('کنارگذاشتن پیش‌نویس موعد');
    const discard = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((choice) => choice.text === 'کنار گذاشتن')!;
    await act(async () => restore());
    await invoke(discard.onPress);
    expect(current()).toEqual(original);
    expect(input('ساعت موعد').props.value).toBe('18:00');
    expect(alertError).toHaveBeenCalledWith('موعد ثبت نشد', expect.any(DatasetChangedError));
  });

  it('rejects a held saved-version reload after restore and preserves local unfinished text', async () => {
    await seedDraft();
    await render();
    const row = current();
    await saveTaskScheduleDraft(
      row.id,
      { ...initialTaskSchedule(row, future), clockText: '20:00' },
      row.scheduleDraftRevision,
    );
    await type('ساعت موعد', 'my unfinished clock');
    await click('بررسی نسخهٔ ذخیره‌شده');
    await click('بارگذاری نسخهٔ ذخیره‌شده');
    const reload = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((choice) => choice.text === 'بارگذاری')!;
    const original = current();
    const restore = snapshot();
    await act(async () => restore());
    await invoke(reload.onPress);
    expect(current()).toEqual(original);
    expect(input('ساعت موعد').props.value).toBe('my unfinished clock');
    expect(alertError).toHaveBeenCalledWith('موعد ثبت نشد', expect.any(DatasetChangedError));
  });

  it('rejects an old reminder-retry callback instead of reconciling a restored task', async () => {
    t.db
      .update(tasks)
      .set({ dueAt: future, reminderEnabled: true, reminderRevision: 1, reminderAppliedRevision: -1 })
      .where(eq(tasks.id, current().id))
      .run();
    const restore = snapshot();
    const original = current();
    await render();
    const retry = button('هماهنگی اعلان؛ تلاش مجدد').props.onPress;
    await act(async () => restore());
    await invoke(retry);
    expect(current()).toEqual(original);
    expect(scheduled.size).toBe(0);
    expect(alertError).toHaveBeenCalledWith('اعلان هماهنگ نشد', expect.any(DatasetChangedError));
  });

  it('keeps publication admitted while the committed deadline awaits its native reminder acknowledgement', async () => {
    await seedDraft();
    await render();
    await act(async () => toggle('اعلان در موعد').props.onChange(true));
    let acknowledge!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      acknowledge = resolve;
    });
    const native = jest.spyOn(notifications, 'scheduleReminder').mockImplementation(() => pending);
    await click('ذخیرهٔ موعد');
    expect(native).toHaveBeenCalledTimes(1);
    expect(current().dueAt).toEqual(future);
    expect(current().scheduleDraft).toBeNull();
    let admissionError: unknown;
    try {
      // Release a mistakenly admitted reservation before the witness fails;
      // otherwise the red run would contaminate following tests.
      const replacement = reserveDatasetReplacement();
      replacement.release();
    } catch (error) {
      admissionError = error;
    }
    await act(async () => {
      acknowledge(taskReminderId(current().id));
      await settle();
    });
    expect(admissionError).toBeInstanceOf(DatasetBusyError);
    const replacement = reserveDatasetReplacement();
    replacement.release();
    expect(button('موعد و یادآور')).toBeDefined();
  });

  it('recovers incomplete text after remount without changing the live deadline', async () => {
    await render();
    await click('موعد و یادآور');
    await act(async () => {
      toggle('موعد دارد').props.onChange(true);
    });
    await type('تاریخ موعد', '۱۴۰');
    await type('ساعت موعد', '۱:');
    expect(current().scheduleDraft).toMatchObject({ dateText: '۱۴۰', clockText: '۱:' });
    expect(current().dueAt).toBeNull();
    expect(scheduled.size).toBe(0);
    await click('بستن');
    await click('موعد و یادآور');
    expect(input('تاریخ موعد').props.value).toBe('۱۴۰');
    await act(async () => {
      tree!.unmount();
    });
    await render();
    expect(input('تاریخ موعد').props.value).toBe('۱۴۰');
    expect(input('ساعت موعد').props.value).toBe('۱:');
    await click('ذخیرهٔ موعد');
    expect(current().dueAt).toBeNull();
    expect(input('تاریخ موعد').props.value).toBe('۱۴۰');
  });

  it('retains failed raw writes, retries, and applies one optional reminder', async () => {
    await render();
    await click('موعد و یادآور');
    await act(async () => {
      toggle('موعد دارد').props.onChange(true);
    });
    t.sqlite.exec(
      "CREATE TRIGGER fail_draft BEFORE UPDATE OF schedule_draft ON tasks BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await type('تاریخ موعد', scheduleDateText(future));
    expect(button('ذخیره نشد؛ تلاش دوباره')).toBeDefined();
    expect(input('تاریخ موعد').props.value).toBe(scheduleDateText(future));
    t.sqlite.exec('DROP TRIGGER fail_draft');
    await click('ذخیره نشد؛ تلاش دوباره');
    await type('ساعت موعد', '18:00');
    await act(async () => {
      toggle('اعلان در موعد').props.onChange(true);
    });
    await click('ذخیرهٔ موعد');
    expect(current()).toMatchObject({ dueAt: future, reminderEnabled: true, scheduleDraft: null });
    expect([...scheduled.keys()]).toEqual([taskReminderId(current().id)]);
  });

  it('shows the competing saved draft and requires explicit choice before replacing it', async () => {
    await render();
    await click('موعد و یادآور');
    const row = current();
    await saveTaskScheduleDraft(
      row.id,
      { ...initialTaskSchedule(row, future), hasDue: true, dateText: 'saved elsewhere' },
      0,
    );
    await act(async () => {
      toggle('موعد دارد').props.onChange(true);
    });
    await type('تاریخ موعد', 'my unfinished date');
    expect(current().scheduleDraft?.dateText).toBe('saved elsewhere');
    await click('بررسی نسخهٔ ذخیره‌شده');
    expect(button('نگه‌داشتن نوشتهٔ من')).toBeDefined();
    await click('نگه‌داشتن نوشتهٔ من');
    expect(current().scheduleDraft?.dateText).toBe('my unfinished date');
  });
});
