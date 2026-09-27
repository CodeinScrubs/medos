import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { PickerModal } from '@/components/picker-modal';
import { createPatient } from '@/features/patients/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase } from '@/test/sqljs';

import { CallsScreen } from './calls-screen';
import { describeShared } from './folder';
import * as queries from './queries';

const mockParams: { shared?: string; name?: string } = {};
const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockRetry = jest.fn();
let mockReadError: Error | undefined;
let mockLoading = false;
let mockCached: unknown[] | undefined;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => {},
}));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[] }) => {
    if (!mockReadError && !mockLoading) mockCached = query.all();
    return { data: mockCached, error: mockReadError, loading: mockLoading, retry: mockRetry };
  },
}));
jest.mock('@/db/use-setting', () => ({
  useSetting: (setting: { fallback: unknown }) => ({ value: setting.fallback, loaded: true }),
}));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/platform/media', () => ({}));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn() }));
jest.mock('@/components/picker-modal', () => ({ PickerModal: 'PickerModal' }));
jest.mock('@/components/voice-note-player', () => ({ VoiceNotePlayer: 'VoiceNotePlayer' }));
jest.mock('@/components/ui', () => ({
  Badge: 'Badge',
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  EmptyState: 'EmptyState',
  Row: 'Row',
  Screen: 'Screen',
  SectionHeader: 'SectionHeader',
  Text: 'Text',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {} }) }));
jest.mock('./folder', () => ({
  describeShared: (uri: string, name: string) => ({
    uri,
    name,
    key: name,
    sizeBytes: 20,
    who: 'Example',
    recordedAt: new Date('2026-09-26T12:00:00Z'),
    timeSource: 'filename',
  }),
}));

let tree: ReactTestRenderer;
let patientId: string;
const picker = () => tree.root.findByType(PickerModal);
function share(uri: string, name: string) {
  mockParams.shared = Buffer.from(uri).toString('hex');
  mockParams.name = name;
}
async function render() {
  await act(async () => {
    tree = create(<CallsScreen />);
  });
}
async function refresh() {
  await act(async () => {
    tree.update(<CallsScreen />);
  });
}
beforeEach(async () => {
  useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Example', lastName: 'Patient' });
  share('content://example/1', 'Example.m4a');
  mockReadError = undefined;
  mockLoading = false;
  mockCached = undefined;
  jest.clearAllMocks();
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
  jest.restoreAllMocks();
});

describe('filing a shared recording from the screen', () => {
  it.each(['params', 'push'])('does not report a saved recording as a failed write after %s fails', async (step) => {
    jest.spyOn(queries, 'fileCallRecording').mockResolvedValue('saved-note');
    const error = new Error('Navigation failed');
    (step === 'params' ? mockSetParams : mockPush).mockImplementationOnce(() => {
      throw error;
    });
    await render();
    await act(async () => {
      picker().props.onSelect({ id: patientId });
    });
    expect(picker().props.visible).toBe(false);
    expect(alertError).toHaveBeenCalledWith('فایل ذخیره شد؛ نوت باز نشد', error);
    expect(alertError).not.toHaveBeenCalledWith('به پرونده اضافه نشد', expect.anything());
  });

  it('keeps the shared audio and patient selection after failure, and ignores overlapping taps', async () => {
    const file = jest
      .spyOn(queries, 'fileCallRecording')
      .mockRejectedValueOnce(new Error('Copy failed'))
      .mockResolvedValue('saved-note');
    await render();
    await act(async () => {
      picker().props.onSelect({ id: patientId });
    });
    expect(picker().props.visible).toBe(true);
    expect(picker().props.selectedId).toBe(patientId);
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(alertError).toHaveBeenCalled();
    await act(async () => {
      const select = picker().props.onSelect;
      select({ id: patientId });
      select({ id: patientId });
    });
    expect(file).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(picker().props.visible).toBe(false);
    expect(mockSetParams).toHaveBeenCalledWith({ shared: undefined, name: undefined });
  });

  it.each([false, true])(
    'offers read retry instead of selecting from failed patient data (cached=%s)',
    async (cached) => {
      const file = jest.spyOn(queries, 'fileCallRecording').mockResolvedValue('note');
      if (cached) await render();
      mockReadError = new Error('Read failed');
      if (cached) await refresh();
      else await render();
      expect(picker().props.visible).toBe(false);
      const notice = tree.root.findByType(ErrorNotice);
      expect(notice.props.error).toBe(mockReadError);
      await act(async () => {
        picker().props.onSelect({ id: patientId });
        notice.props.onRetry();
      });
      expect(file).not.toHaveBeenCalled();
      expect(mockRetry).toHaveBeenCalledTimes(1);
      mockReadError = undefined;
      await refresh();
      expect(picker().props.visible).toBe(true);
      expect(picker().props.items).toHaveLength(1);
    },
  );

  it('does not call an unresolved patient read an empty patient list', async () => {
    mockLoading = true;
    await render();
    expect(picker().props.emptyText).toBe('در حال خواندن…');
  });

  it('does not consume a newer share while the previous recording finishes copying', async () => {
    let finish!: (noteId: string) => void;
    const file = jest.spyOn(queries, 'fileCallRecording').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    await act(async () => {
      picker().props.onSelect({ id: patientId });
    });
    share('content://example/2', 'Second.m4a');
    await refresh();
    await act(async () => {
      finish('first-note');
    });
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(picker().props.visible).toBe(true);
    await act(async () => {
      picker().props.onSelect({ id: patientId });
    });
    expect(file.mock.calls[1]?.[1]).toEqual(describeShared('content://example/2', 'Second.m4a'));
    await act(async () => {
      finish('second-note');
    });
  });
});
