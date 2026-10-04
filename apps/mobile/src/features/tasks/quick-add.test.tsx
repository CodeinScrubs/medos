import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { Button, Input } from '@/components/ui';
import { restoreDatabase } from '@/db/client';
import type { TaskDraft } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { createPatient } from '@/features/patients/queries';
import {
  DatasetBusyError,
  DatasetChangedError,
  datasetGeneration,
  reserveDatasetReplacement,
} from '@/lib/dataset-write';
import { SaveGroup } from '@/lib/save-before-leave';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { saveTaskDraft, taskDraftQuery } from './draft-queries';
import * as draftQueries from './draft-queries';
import { tasksQuery } from './queries';
import { TaskDraftEditor } from './quick-add';

let mockScope: { group: SaveGroup; readonly generation: number };
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
let snapshotCounter = 0;
function snapshot() {
  const path = `/quick-task-intent-${++snapshotCounter}.db`;
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
const reset = jest.fn<(draft: TaskDraft | null) => void>();
const input = () => tree.root.findByType(Input);
const button = (label: string) => tree.root.findAllByType(Button).find((node) => node.props.label === label)!;
async function settle() {
  for (let i = 0; i < 24; i++) await Promise.resolve();
}
async function mount(initial: TaskDraft | null = null, shiftId: string | null = null) {
  await act(async () => {
    tree = create(<TaskDraftEditor initial={initial} patientId={patientId} shiftId={shiftId} onReset={reset} />);
  });
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Test', lastName: 'Patient', status: 'outpatient' });
  mockScope = { group: new SaveGroup(), generation: datasetGeneration() };
  reset.mockClear();
  jest.mocked(alertError).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
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
  jest.restoreAllMocks();
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

describe('quick-add dataset intent', () => {
  async function saved() {
    await saveTaskDraft('saved-task-intent', { patientId, shiftId: null }, 'Saved task', 0);
    return (await taskDraftQuery(patientId))[0]!;
  }
  async function compared() {
    await mount();
    await saveTaskDraft('other', { patientId, shiftId: null }, 'Stored elsewhere', 0);
    await act(async () => {
      input().props.onChangeText('Local task');
      expect(await mockScope.group.flush()).toBe(false);
    });
    await act(async () => {
      button('بررسی پیش‌نویس ذخیره‌شده').props.onPress();
      await settle();
    });
  }

  it('refuses an old clean publish callback even when the restored draft has the same id and revision', async () => {
    const initial = await saved();
    const restore = snapshot();
    await mount(initial);
    expect(mockScope.group.unsaved).toBe(false);
    const publish = button('افزودن').props.onPress;
    await act(async () => {
      restore();
      publish();
      await settle();
    });
    expect(await taskDraftQuery(patientId)).toEqual([initial]);
    expect(await tasksQuery()).toHaveLength(0);
    expect(input().props.value).toBe('Saved task');
    expect(reset).not.toHaveBeenCalled();
    expect(alertError).toHaveBeenCalledWith('ثبت نشد', expect.any(DatasetChangedError));
  });

  it('retains dirty text and the restored saved draft after stale persistence and publication fail', async () => {
    const initial = await saved();
    const restore = snapshot();
    await mount(initial);
    await act(async () => {
      input().props.onChangeText('Unsaved local task');
      restore();
      expect(await mockScope.group.flush()).toBe(false);
      button('افزودن').props.onPress();
      await settle();
    });
    expect(await taskDraftQuery(patientId)).toEqual([initial]);
    expect(await tasksQuery()).toHaveLength(0);
    expect(input().props.value).toBe('Unsaved local task');
    expect(mockScope.group.unsaved).toBe(true);
    expect(reset).not.toHaveBeenCalled();
  });

  it('inherits the old containing scope when the editor mounts only after replacement', async () => {
    const initial = await saved();
    const restore = snapshot();
    const original = mockScope.generation;
    restore();
    expect(datasetGeneration()).not.toBe(original);
    await mount(initial);
    await act(async () => {
      input().props.onChangeText('Late-mounted local task');
      expect(await mockScope.group.flush()).toBe(false);
    });
    expect(await taskDraftQuery(patientId)).toEqual([initial]);
    expect(input().props.value).toBe('Late-mounted local task');
    expect(mockScope.group.unsaved).toBe(true);
    expect(reset).not.toHaveBeenCalled();
  });

  it('rejects an old load confirmation without cancelling the saver or resetting local text', async () => {
    await compared();
    const initial = (await taskDraftQuery(patientId))[0]!;
    const restore = snapshot();
    act(() => button('بارگذاری نسخهٔ ذخیره‌شده').props.onPress());
    const load = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((choice) => choice.text === 'بارگذاری')!.onPress!;
    await act(async () => {
      restore();
      load();
      await settle();
    });
    expect(await taskDraftQuery(patientId)).toEqual([initial]);
    expect(input().props.value).toBe('Local task');
    expect(mockScope.group.unsaved).toBe(true);
    expect(reset).not.toHaveBeenCalled();
    expect(alertError).toHaveBeenCalledWith('ثبت نشد', expect.any(DatasetChangedError));
  });

  it('rejects an old adopt callback while preserving the compared draft and local input', async () => {
    await compared();
    const initial = (await taskDraftQuery(patientId))[0]!;
    const restore = snapshot();
    const adopt = button('نگه‌داشتن نوشتهٔ من').props.onPress;
    await act(async () => {
      restore();
      adopt();
      await settle();
    });
    expect(await taskDraftQuery(patientId)).toEqual([initial]);
    expect(input().props.value).toBe('Local task');
    expect(mockScope.group.unsaved).toBe(true);
    expect(reset).not.toHaveBeenCalled();
    expect(button('نگه‌داشتن نوشتهٔ من')).toBeDefined();
    expect(alertError).toHaveBeenCalledWith('ثبت نشد', expect.any(DatasetChangedError));
  });

  it('holds admission until an actual clean publication acknowledges its database write', async () => {
    const initial = await saved();
    await mount(initial);
    let entered!: () => void;
    const committed = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let acknowledge!: () => void;
    const waiting = new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    const actual = draftQueries.commitTaskDraft;
    jest.spyOn(draftQueries, 'commitTaskDraft').mockImplementation(async (...args) => {
      const id = await actual(...args);
      entered();
      await waiting;
      return id;
    });
    await act(async () => {
      button('افزودن').props.onPress();
      await committed;
      try {
        expect(await tasksQuery()).toHaveLength(1);
        expect(reset).not.toHaveBeenCalled();
        expect(() => reserveDatasetReplacement().release()).toThrow(DatasetBusyError);
      } finally {
        acknowledge();
        await settle();
      }
    });
    expect(reset).toHaveBeenCalledWith(null);
    reserveDatasetReplacement().release();
  });
});
