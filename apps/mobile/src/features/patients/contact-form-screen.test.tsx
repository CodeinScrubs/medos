import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { Button, Input } from '@/components/ui';
import { DatasetBusyError, DatasetChangedError, datasetGeneration } from '@/lib/dataset-write';
import { databaseRows, replacementFailure, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { ContactFormScreen } from './contact-form-screen';
import { createPatient, deletePatient, patientContactsQuery } from './queries';
import * as queries from './queries';

let mockPatientId: string;
let mockParentGeneration: number | null;
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: mockPatientId }),
  useRouter: () => ({ back: mockBack }),
}));
jest.mock('@/components/autosave-scope', () => ({
  useAutosaveScope: () => (mockParentGeneration === null ? null : { generation: mockParentGeneration }),
}));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  Input: 'Input',
  Screen: 'Screen',
}));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/theme', () => ({ useTheme: () => ({ spacing: {} }) }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let tree: ReactTestRenderer | undefined;
const input = (label: string) => tree!.root.findAllByType(Input).find((node) => node.props.label === label)!;
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
async function settle() {
  for (let i = 0; i < 45; i++) await Promise.resolve();
}
async function mount() {
  await act(async () => {
    tree = create(<ContactFormScreen />);
    await settle();
  });
}
async function type(label: string, value: string) {
  await act(async () => {
    input(label).props.onChangeText(value);
    await settle();
  });
}
async function save() {
  await act(async () => {
    button('ذخیره').props.onPress();
    await settle();
  });
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  mockPatientId = await createPatient({ firstName: 'Synthetic', lastName: 'Contact' });
  mockParentGeneration = null;
  mockBack.mockReset();
  jest.mocked(alertError).mockClear();
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  tree = undefined;
  jest.restoreAllMocks();
});

describe('companion form original intent', () => {
  it('refuses same-id replacement and retains all actual input', async () => {
    await mount();
    await type('شماره تماس', '+12025550123');
    await type('نام', 'Companion');
    await type('یادداشت', 'Keep this exact text');
    const replace = snapshotDataset(t);
    await act(async () => {
      replace();
      await settle();
    });
    const before = databaseRows(t);
    await save();
    expect(databaseRows(t)).toEqual(before);
    expect(mockBack).not.toHaveBeenCalled();
    expect(input('یادداشت').props.value).toBe('Keep this exact text');
    expect(alertError).toHaveBeenLastCalledWith('ذخیره نشد', expect.any(DatasetChangedError));
  });
  it('inherits an old parent intent even when this form mounts after replacement', async () => {
    mockParentGeneration = datasetGeneration();
    snapshotDataset(t)();
    await mount();
    await type('شماره تماس', '+12025550123');
    const before = databaseRows(t);
    await save();
    expect(databaseRows(t)).toEqual(before);
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('keeps admission and locks input/cancel through final query acknowledgment', async () => {
    const original = queries.addPatientContact;
    let release = () => {};
    jest.spyOn(queries, 'addPatientContact').mockImplementationOnce(async (...args) => {
      const id = await original(...args);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return id;
    });
    await mount();
    await type('شماره تماس', '+12025550123');
    await save();
    const failure = replacementFailure();
    const editable = input('شماره تماس').props.editable;
    await act(async () => {
      button('ذخیره').props.onPress();
      button('انصراف').props.onPress();
      release();
      await settle();
    });
    expect(failure).toBeInstanceOf(DatasetBusyError);
    expect(editable).toBe(false);
    expect(await patientContactsQuery(mockPatientId)).toHaveLength(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('saves the latest input once when typing and repeated Save occur in the same turn', async () => {
    await mount();
    await act(async () => {
      input('شماره تماس').props.onChangeText('+12025550123');
      input('نام').props.onChangeText('Final name');
      input('یادداشت').props.onChangeText('Final text');
      button('ذخیره').props.onPress();
      button('ذخیره').props.onPress();
      await settle();
    });
    expect(await patientContactsQuery(mockPatientId)).toMatchObject([{ name: 'Final name', notes: 'Final text' }]);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('rejects a soft-deleted parent before inserting a contact and keeps input', async () => {
    await mount();
    await type('شماره تماس', '+12025550123');
    await deletePatient(mockPatientId);
    const before = databaseRows(t);
    await save();
    expect(databaseRows(t)).toEqual(before);
    expect(input('شماره تماس').props.value).toBe('+12025550123');
    expect(mockBack).not.toHaveBeenCalled();
    expect(alertError).toHaveBeenCalled();
  });
  it('keeps SQL-failed input, unlocks it and permits a fresh retry', async () => {
    await mount();
    await type('شماره تماس', '+12025550123');
    t.sqlite.exec(
      "CREATE TRIGGER fail_contact BEFORE INSERT ON patient_contacts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    await save();
    expect(input('شماره تماس').props.value).toBe('+12025550123');
    expect(input('شماره تماس').props.editable).not.toBe(false);
    expect(mockBack).not.toHaveBeenCalled();
    t.sqlite.exec('DROP TRIGGER fail_contact');
    await save();
    expect(await patientContactsQuery(mockPatientId)).toHaveLength(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
