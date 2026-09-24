import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AutosaveScope } from '@/components/autosave-scope';
import { Button, Input, Toggle } from '@/components/ui';
import { tasks } from '@/db/schema';
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
jest.mock('@/components/feedback', () => ({ alertError: jest.fn() }));
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
        <TaskSchedule task={current()} />
      </AutosaveScope>,
    );
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
  jest.useFakeTimers();
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
  tree = undefined;
  jest.useRealTimers();
});

describe('task schedule editor', () => {
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
    await click('اعمال موعد');
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
    await click('اعمال موعد');
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
