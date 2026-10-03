import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { PromptModal } from '@/components/prompt-modal';
import { Button, ChipSelect, Input } from '@/components/ui';
import { restoreDatabase } from '@/db/client';
import { importTables } from '@/features/backup/import';
import { createPatient } from '@/features/patients/queries';
import { DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { DiagnosesSection } from './diagnoses-section';
import * as queries from './queries';

// Actual native-Modal stand-ins + SQLite can exceed Jest's 5 s cold-worker
// limit on the shared Windows host. Keep a bounded file-local budget.
jest.setTimeout(15000);

jest.mock('react-native', () => {
  const native = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy(native, { get: (target, key) => (key === 'Pressable' ? 'Pressable' : Reflect.get(target, key)) });
});
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/db/use-live', () => ({ useLive: (query: { all(): unknown[] }) => ({ data: query.all() }) }));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn() }));
jest.mock('react-native-keyboard-controller', () => ({ KeyboardController: { isVisible: () => false } }));
jest.mock('@/components/ui', () => ({
  Badge: 'Badge',
  Button: 'Button',
  Card: 'Card',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  Input: 'Input',
  Row: 'Row',
  SectionHeader: 'SectionHeader',
  Text: 'Text',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, radii: {}, spacing: {}, shadows: {} }) }));

let tree: ReactTestRenderer | undefined;
let t: TestDatabase;
let patientId: string;
let snapshotCounter = 0;
const addInput = () => tree!.root.findAllByType(Input).find((node) => node.props.placeholder === 'مثلاً CKD stage 3')!;
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
const row = () => tree!.root.findAllByType(Pressable).find((node) => typeof node.props.onLongPress === 'function')!;
async function settle() {
  for (let i = 0; i < 24; i++) await Promise.resolve();
}
async function render() {
  await act(async () => {
    tree = create(<DiagnosesSection patientId={patientId} />);
  });
}
function snapshot() {
  const path = `/diagnosis-intent-${++snapshotCounter}.db`;
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
async function askStatus() {
  await act(async () => row().props.onPress());
  return jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
}
async function startEdit() {
  const choices = await askStatus();
  await act(async () => choices.find((choice) => choice.text === 'اصلاح متن')!.onPress?.());
}
const promptInput = () => tree!.root.findByType(PromptModal).findByType(Input);
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Diagnosis' });
  jest.mocked(alertError).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  tree = undefined;
  jest.restoreAllMocks();
});

describe('diagnosis handlers with real migrated SQLite and the actual prompt', () => {
  it('publishes once when one Add callback is invoked twice before rendering', async () => {
    await render();
    await act(async () => addInput().props.onChangeText('Synthetic condition'));
    const add = button('افزودن').props.onPress;
    await act(async () => {
      add();
      add();
      await settle();
    });
    expect(await queries.patientDiagnosesQuery(patientId)).toHaveLength(1);
  });

  it('captures the latest title when typing and Add happen in the same event', async () => {
    await render();
    const add = button('افزودن').props.onPress;
    await act(async () => {
      addInput().props.onChangeText('Latest title');
      add();
      await settle();
    });
    expect((await queries.patientDiagnosesQuery(patientId))[0]?.title).toBe('Latest title');
  });

  it('captures the selected kind in the same event as publication', async () => {
    await render();
    await act(async () => addInput().props.onChangeText('Synthetic complication'));
    const add = button('افزودن').props.onPress;
    await act(async () => {
      tree!.root.findByType(ChipSelect).props.onChange('complication');
      add();
      await settle();
    });
    expect((await queries.patientDiagnosesQuery(patientId))[0]?.kind).toBe('complication');
  });

  it('keeps an old new diagnosis input and refuses publication after replacement', async () => {
    const restore = snapshot();
    await render();
    await act(async () => addInput().props.onChangeText('Unpublished condition'));
    await act(async () => {
      restore();
      button('افزودن').props.onPress();
      await settle();
    });
    expect(await queries.patientDiagnosesQuery(patientId)).toHaveLength(0);
    expect(addInput().props.value).toBe('Unpublished condition');
    expect(alertError).toHaveBeenCalledWith('اضافه نشد', expect.any(DatasetChangedError));
  });

  it('retains actual corrected prompt text after SQL failure and closes only after successful retry', async () => {
    const id = await queries.addDiagnosis({ patientId, title: 'Original title' });
    await render();
    await startEdit();
    await act(async () => promptInput().props.onChangeText('Corrected title'));
    t.sqlite.exec(
      "CREATE TRIGGER refuse_diagnosis BEFORE UPDATE ON diagnoses BEGIN SELECT RAISE(ABORT, 'Synthetic failure'); END;",
    );
    await act(async () => {
      button('ذخیره').props.onPress();
      await settle();
    });
    expect(tree!.root.findByType(PromptModal).props.visible).toBe(true);
    expect(promptInput().props.value).toBe('Corrected title');
    expect((await queries.diagnosisQuery(id))[0]?.title).toBe('Original title');
    expect(alertError).toHaveBeenCalledWith('اصلاح نشد', expect.any(Error));
    t.sqlite.exec('DROP TRIGGER refuse_diagnosis');
    await act(async () => {
      button('ذخیره').props.onPress();
      await settle();
    });
    expect((await queries.diagnosisQuery(id))[0]?.title).toBe('Corrected title');
    expect(tree!.root.findByType(PromptModal).props.visible).toBe(false);
  });

  it('retains correction text and refuses an old prompt after same-ID replacement', async () => {
    const id = await queries.addDiagnosis({ patientId, title: 'Restored title' });
    const restore = snapshot();
    await render();
    await startEdit();
    await act(async () => promptInput().props.onChangeText('Old local correction'));
    await act(async () => {
      restore();
      button('ذخیره').props.onPress();
      await settle();
    });
    expect((await queries.diagnosisQuery(id))[0]?.title).toBe('Restored title');
    expect(tree!.root.findByType(PromptModal).props.visible).toBe(true);
    expect(promptInput().props.value).toBe('Old local correction');
    expect(alertError).toHaveBeenCalledWith('اصلاح نشد', expect.any(DatasetChangedError));
  });

  it('rejects status and delete confirmations held across replacement and remount', async () => {
    const id = await queries.addDiagnosis({ patientId, title: 'Restored condition' });
    const restore = snapshot();
    await render();
    const status = (await askStatus()).find((choice) => choice.text === 'برطرف شد')!;
    await act(async () => row().props.onLongPress());
    const remove = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((choice) => choice.text === 'حذف')!;
    await act(async () => {
      restore();
      tree!.unmount();
    });
    await render();
    await act(async () => {
      status.onPress?.();
      remove.onPress?.();
      await settle();
    });
    expect((await queries.diagnosisQuery(id))[0]).toMatchObject({ status: 'active', deletedAt: null });
    expect(alertError).toHaveBeenCalledWith('تغییر ثبت نشد', expect.any(DatasetChangedError));
    expect(alertError).toHaveBeenCalledWith('حذف نشد', expect.any(DatasetChangedError));
    const fresh = (await askStatus()).find((choice) => choice.text === 'برطرف شد')!;
    await act(async () => {
      fresh.onPress?.();
      await settle();
    });
    expect((await queries.diagnosisQuery(id))[0]?.status).toBe('resolved');
  });

  it('locks a pending correction, refuses duplicate Submit and defers dismissal until real acknowledgment', async () => {
    const id = await queries.addDiagnosis({ patientId, title: 'Original' });
    await render();
    await startEdit();
    await act(async () => promptInput().props.onChangeText('Acknowledged correction'));
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const update = queries.updateDiagnosis;
    const called = jest.spyOn(queries, 'updateDiagnosis').mockImplementation(async (...args) => {
      await pending;
      await update(...args);
    });
    const submit = button('ذخیره').props.onPress;
    await act(async () => {
      submit();
      submit();
      await settle();
    });
    const prompt = tree!.root.findByType(PromptModal);
    expect(prompt.props.busy).toBe(true);
    expect(promptInput().props.editable).toBe(false);
    expect(button('انصراف').props.disabled).toBe(true);
    await act(async () => {
      prompt.props.onCancel();
      await settle();
    });
    expect(tree!.root.findByType(PromptModal).props.visible).toBe(true);
    expect(() => reserveDatasetReplacement()).toThrow();
    await act(async () => {
      finish();
      await settle();
    });
    expect(called).toHaveBeenCalledTimes(1);
    expect((await queries.diagnosisQuery(id))[0]?.title).toBe('Acknowledged correction');
    expect(tree!.root.findByType(PromptModal).props.visible).toBe(false);
  });
});
