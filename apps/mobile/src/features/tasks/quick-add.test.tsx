import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Button, Input } from '@/components/ui';
import type { TaskDraft } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { SaveGroup } from '@/lib/save-before-leave';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { saveTaskDraft, taskDraftQuery } from './draft-queries';
import { tasksQuery } from './queries';
import { TaskDraftEditor } from './quick-add';

let mockScope: { group: SaveGroup };
jest.mock('@/components/autosave-scope', () => ({ useAutosaveScope: () => mockScope }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  Input: 'Input',
  Row: 'Row',
  Text: 'Text',
}));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({
  alertError: jest.fn(),
  notify: jest.requireActual<typeof import('@/components/feedback')>('@/components/feedback').notify,
}));
jest.mock('@/db/use-live', () => ({ useLive: () => ({ data: [], error: undefined }) }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let patientId: string;
let tree: ReactTestRenderer;
const reset = jest.fn<(draft: TaskDraft | null) => void>();
const input = () => tree.root.findByType(Input);
const button = (label: string) => tree.root.findAllByType(Button).find((node) => node.props.label === label)!;
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
async function mount(initial: TaskDraft | null = null, shiftId: string | null = null) {
  await act(async () => {
    tree = create(<TaskDraftEditor initial={initial} patientId={patientId} shiftId={shiftId} onReset={reset} />);
  });
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Test', lastName: 'Patient', status: 'outpatient' });
  mockScope = { group: new SaveGroup() };
  reset.mockClear();
  jest.useFakeTimers();
});
afterEach(async () => {
  if (tree)
    await act(async () => {
      tree.unmount();
      await settle();
    });
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('quick-add recovery and screen transitions', () => {
  it('flushes before a patient/tab action, recovers the title, and preserves an explicitly unlinked shift', async () => {
    await mount();
    const leave = jest.fn<() => void>();
    await act(async () => {
      input().props.onChangeText('Unsaved task');
      expect(await mockScope.group.perform(leave)).toBe('done');
    });
    expect(leave).toHaveBeenCalledTimes(1);
    expect(await tasksQuery()).toHaveLength(0);
    const saved = (await taskDraftQuery(patientId))[0]!;
    await act(async () => tree.unmount());
    // A later round must not retroactively claim a draft captured outside a shift.
    await mount(saved, 'not-a-real-shift');
    expect(input().props.value).toBe('Unsaved task');
    await act(async () => {
      button('افزودن').props.onPress();
      await settle();
    });
    expect((await tasksQuery())[0]?.task).toMatchObject({ title: 'Unsaved task', shiftId: null });
    expect(reset).toHaveBeenCalledWith(null);
  });

  it('blocks switching and adding on failed persistence, then publishes once without losing the title', async () => {
    await mount();
    const leave = jest.fn<() => void>();
    t.sqlite.exec(
      "CREATE TRIGGER fail_task_draft BEFORE INSERT ON task_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await act(async () => {
      input().props.onChangeText('Keep this title');
      expect(await mockScope.group.perform(leave)).toBe('unsaved');
      button('افزودن').props.onPress();
      button('افزودن').props.onPress();
      await settle();
    });
    expect(input().props.value).toBe('Keep this title');
    expect(leave).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(await tasksQuery()).toHaveLength(0);
    t.sqlite.exec('DROP TRIGGER fail_task_draft');
    await act(async () => {
      button('افزودن').props.onPress();
      button('افزودن').props.onPress();
      await settle();
    });
    expect(await tasksQuery()).toHaveLength(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('keeps a conflicting local title until the owner chooses the compared draft', async () => {
    await mount();
    await saveTaskDraft('other', { patientId, shiftId: null }, 'Stored elsewhere', 0);
    await act(async () => {
      input().props.onChangeText('My title');
      expect(await mockScope.group.flush()).toBe(false);
    });
    expect(input().props.value).toBe('My title');
    await act(async () => {
      button('بررسی پیش‌نویس ذخیره‌شده').props.onPress();
      await settle();
    });
    await saveTaskDraft('other', { patientId, shiftId: null }, 'Even newer', 1);
    await act(async () => {
      button('نگه‌داشتن نوشتهٔ من').props.onPress();
      await settle();
    });
    expect((await taskDraftQuery(patientId))[0]?.title).toBe('Even newer');
    await act(async () => {
      button('بررسی پیش‌نویس ذخیره‌شده').props.onPress();
      await settle();
    });
    await act(async () => {
      button('نگه‌داشتن نوشتهٔ من').props.onPress();
      await settle();
    });
    expect((await taskDraftQuery(patientId))[0]?.title).toBe('My title');
    expect(await tasksQuery()).toHaveLength(0);
  });
});
