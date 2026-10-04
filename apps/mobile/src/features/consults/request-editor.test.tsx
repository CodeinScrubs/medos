import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { Button, Input } from '@/components/ui';
import { restoreDatabase } from '@/db/client';
import type { ConsultRequestDraft } from '@/db/schema';
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

import { openConsultsQuery } from './queries';
import { requestDraftQuery, saveRequestDraft } from './request-drafts';
import * as draftQueries from './request-drafts';
import { RequestDraftEditor } from './request-editor';

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
  const path = `/consult-request-intent-${++snapshotCounter}.db`;
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
const reset = jest.fn<(draft: ConsultRequestDraft | null) => void>();
const input = (placeholder: string) =>
  tree.root.findAllByType(Input).find((node) => node.props.placeholder === placeholder)!;
const button = (label: string) => tree.root.findAllByType(Button).find((node) => node.props.label === label)!;
async function settle() {
  for (let i = 0; i < 24; i++) await Promise.resolve();
}
async function mount(initial: ConsultRequestDraft | null = null) {
  await act(async () => {
    tree = create(<RequestDraftEditor initial={initial} patientId={patientId} onReset={reset} />);
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

describe('consult request editor recovery', () => {
  it('flushes both fields before switching tabs and recovers them without publishing', async () => {
    await mount();
    const leave = jest.fn<() => void>();
    await act(async () => {
      input('سرویس').props.onChangeText('Service');
      input('سؤال کانسالت').props.onChangeText('Exact question');
      expect(await mockScope.group.perform(leave)).toBe('done');
    });
    expect(leave).toHaveBeenCalledTimes(1);
    expect(await openConsultsQuery()).toHaveLength(0);
    const saved = (await requestDraftQuery(patientId))[0]!;
    await act(async () => tree.unmount());
    await mount(saved);
    expect(input('سرویس').props.value).toBe('Service');
    expect(input('سؤال کانسالت').props.value).toBe('Exact question');
  });

  it('keeps text and blocks departure on failed save, then publishes once on retry', async () => {
    await mount();
    const leave = jest.fn<() => void>();
    t.sqlite.exec(
      "CREATE TRIGGER fail_request BEFORE INSERT ON consult_request_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await act(async () => {
      input('سؤال کانسالت').props.onChangeText('Keep question');
      expect(await mockScope.group.perform(leave)).toBe('unsaved');
      button('ثبت کانسالت').props.onPress();
      await settle();
    });
    expect(input('سؤال کانسالت').props.value).toBe('Keep question');
    expect(leave).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(await openConsultsQuery()).toHaveLength(0);
    t.sqlite.exec('DROP TRIGGER fail_request');
    await act(async () => {
      button('ثبت کانسالت').props.onPress();
      button('ثبت کانسالت').props.onPress();
      await settle();
    });
    expect(await openConsultsQuery()).toHaveLength(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('requires comparison with the actual stored version before replacing conflicting text', async () => {
    await mount();
    await saveRequestDraft('other', patientId, { specialty: 'Other', reason: 'Stored' }, 0);
    await act(async () => {
      input('سؤال کانسالت').props.onChangeText('Local');
      expect(await mockScope.group.flush()).toBe(false);
    });
    await act(async () => {
      button('بررسی پیش‌نویس ذخیره‌شده').props.onPress();
      await settle();
    });
    await saveRequestDraft('other', patientId, { specialty: 'Other', reason: 'Newer' }, 1);
    await act(async () => {
      button('نگه‌داشتن نوشتهٔ من').props.onPress();
      await settle();
    });
    expect((await requestDraftQuery(patientId))[0]?.reason).toBe('Newer');
    expect(input('سؤال کانسالت').props.value).toBe('Local');
    await act(async () => {
      button('بررسی پیش‌نویس ذخیره‌شده').props.onPress();
      await settle();
    });
    await act(async () => {
      button('نگه‌داشتن نوشتهٔ من').props.onPress();
      await settle();
    });
    expect((await requestDraftQuery(patientId))[0]?.reason).toBe('Local');
    expect(await openConsultsQuery()).toHaveLength(0);
  });
});

describe('consult request dataset intent', () => {
  async function saved() {
    await saveRequestDraft('saved-request-intent', patientId, { specialty: 'Service', reason: 'Saved question' }, 0);
    return (await requestDraftQuery(patientId))[0]!;
  }
  async function compared() {
    await mount();
    await saveRequestDraft('other', patientId, { specialty: 'Other', reason: 'Stored elsewhere' }, 0);
    await act(async () => {
      input('سؤال کانسالت').props.onChangeText('Local question');
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
    const publish = button('ثبت کانسالت').props.onPress;
    await act(async () => {
      restore();
      publish();
      await settle();
    });
    expect(await requestDraftQuery(patientId)).toEqual([initial]);
    expect(await openConsultsQuery()).toHaveLength(0);
    expect(input('سؤال کانسالت').props.value).toBe('Saved question');
    expect(reset).not.toHaveBeenCalled();
    expect(alertError).toHaveBeenCalledWith('ثبت نشد', expect.any(DatasetChangedError));
  });

  it('retains dirty text and the restored saved draft after stale persistence and publication fail', async () => {
    const initial = await saved();
    const restore = snapshot();
    await mount(initial);
    await act(async () => {
      input('سؤال کانسالت').props.onChangeText('Unsaved local question');
      restore();
      expect(await mockScope.group.flush()).toBe(false);
      button('ثبت کانسالت').props.onPress();
      await settle();
    });
    expect(await requestDraftQuery(patientId)).toEqual([initial]);
    expect(await openConsultsQuery()).toHaveLength(0);
    expect(input('سؤال کانسالت').props.value).toBe('Unsaved local question');
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
      input('سؤال کانسالت').props.onChangeText('Late-mounted local question');
      expect(await mockScope.group.flush()).toBe(false);
    });
    expect(await requestDraftQuery(patientId)).toEqual([initial]);
    expect(input('سؤال کانسالت').props.value).toBe('Late-mounted local question');
    expect(mockScope.group.unsaved).toBe(true);
    expect(reset).not.toHaveBeenCalled();
  });

  it('rejects an old load confirmation without cancelling the saver or resetting local text', async () => {
    await compared();
    const initial = (await requestDraftQuery(patientId))[0]!;
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
    expect(await requestDraftQuery(patientId)).toEqual([initial]);
    expect(input('سؤال کانسالت').props.value).toBe('Local question');
    expect(mockScope.group.unsaved).toBe(true);
    expect(reset).not.toHaveBeenCalled();
    expect(alertError).toHaveBeenCalledWith('ثبت نشد', expect.any(DatasetChangedError));
  });

  it('rejects an old adopt callback while preserving the compared draft and local input', async () => {
    await compared();
    const initial = (await requestDraftQuery(patientId))[0]!;
    const restore = snapshot();
    const adopt = button('نگه‌داشتن نوشتهٔ من').props.onPress;
    await act(async () => {
      restore();
      adopt();
      await settle();
    });
    expect(await requestDraftQuery(patientId)).toEqual([initial]);
    expect(input('سؤال کانسالت').props.value).toBe('Local question');
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
    const actual = draftQueries.commitRequestDraft;
    jest.spyOn(draftQueries, 'commitRequestDraft').mockImplementation(async (...args) => {
      const id = await actual(...args);
      entered();
      await waiting;
      return id;
    });
    await act(async () => {
      button('ثبت کانسالت').props.onPress();
      await committed;
      try {
        expect(await openConsultsQuery()).toHaveLength(1);
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
