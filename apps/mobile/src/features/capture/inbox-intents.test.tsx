import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PickerModal } from '@/components/picker-modal';
import { createPatient } from '@/features/patients/queries';
import { databaseRows, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { CaptureCard } from './capture-card';
import { InboxScreen } from './inbox-screen';
import { InboxSection } from './inbox-section';
import * as queries from './queries';

const mockPush = jest.fn();
let mockFocused = true;
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({ isFocused: () => mockFocused }) }));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[] }) => ({ data: query.all(), retry: jest.fn(), loading: false }),
}));
jest.mock('@/components/picker-modal', () => ({ PickerModal: 'PickerModal' }));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn() }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Column: 'Column',
  EmptyState: 'EmptyState',
  Input: 'Input',
  Row: 'Row',
  Screen: 'Screen',
  SectionHeader: 'SectionHeader',
  Text: 'Text',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ spacing: {} }) }));
jest.mock('./capture-card', () => ({ CaptureCard: 'CaptureCard', groupMedia: () => new Map(), NO_MEDIA: [] }));
jest.mock('@/features/attachments/recording-recovery', () => ({
  RecordingRecovery: 'RecordingRecovery',
  RecordingRecoveryNotice: 'RecordingRecoveryNotice',
}));

let tree: ReactTestRenderer;
let t: TestDatabase;
let patientId: string;
let captureId: string;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Picker' });
  captureId = await queries.createCapture({ text: 'Synthetic captured instruction' });
  mockPush.mockClear();
  mockFocused = true;
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  jest.restoreAllMocks();
});
const settle = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
async function mount(Component: typeof InboxScreen, purpose: 'assign' | 'note') {
  await act(async () => {
    tree = create(<Component />);
  });
  await act(async () => {
    tree.root.findByType(CaptureCard).props.onAskPatient({ captureId, purpose, selectedId: null });
  });
}

describe.each([InboxScreen, InboxSection])('inbox original picker intent (%p)', (Component) => {
  it('does not navigate over a newer route after filing acknowledgment finishes', async () => {
    await mount(Component, 'note');
    const original = queries.fileCaptureAsNote;
    let release: () => void = () => {
      throw new Error('Filing not requested');
    };
    jest.spyOn(queries, 'fileCaptureAsNote').mockImplementation(async (...args) => {
      const id = await original(...args);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return id;
    });
    await act(async () => {
      tree.root.findByType(PickerModal).props.onSelect({ id: patientId });
      await settle();
    });
    expect(queries.captureQuery(captureId).get()?.filedAt).not.toBeNull();
    mockFocused = false;
    await act(async () => {
      release();
      await settle();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
  it.each(['assign', 'note'] as const)(
    'refuses a delayed %s choice after replacement with the same IDs',
    async (purpose) => {
      await mount(Component, purpose);
      const pick = tree.root.findByType(PickerModal).props.onSelect;
      await act(async () => {
        snapshotDataset(t)();
      });
      const before = databaseRows(t);
      await act(async () => {
        pick({ id: patientId });
        await settle();
      });
      expect(databaseRows(t)).toEqual(before);
      expect(mockPush).not.toHaveBeenCalled();
    },
  );

  it('retains the picker on failed publication and ignores a duplicate choice until acknowledgment', async () => {
    await mount(Component, 'note');
    t.sqlite.exec(
      "CREATE TRIGGER fail_filing BEFORE UPDATE OF filed_at ON capture_inbox BEGIN SELECT RAISE(ABORT, 'Synthetic filing'); END;",
    );
    await act(async () => {
      tree.root.findByType(PickerModal).props.onSelect({ id: patientId });
      await settle();
    });
    expect(tree.root.findByType(PickerModal).props.visible).toBe(true);
    t.sqlite.exec('DROP TRIGGER fail_filing');
    const file = jest.spyOn(queries, 'fileCaptureAsNote');
    const choose = tree.root.findByType(PickerModal).props.onSelect;
    await act(async () => {
      choose({ id: patientId });
      choose({ id: patientId });
      await settle();
    });
    expect(file).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
