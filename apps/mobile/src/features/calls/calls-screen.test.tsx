import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { PickerModal } from '@/components/picker-modal';
import { Button } from '@/components/ui';
import { callImports } from '@/db/schema';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { stamps } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { CallsScreen } from './calls-screen';
import { describeShared } from './folder';
import { encodeCallSource } from './import-logic';
import * as queries from './queries';

const mockParams: { shared?: string; name?: string; request?: string } = {};
const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockRetry = jest.fn();
let mockReadError: Error | undefined;
let mockImportError: Error | undefined;
let mockLoading = false;
let mockCached: unknown[] | undefined;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => {},
}));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[]; toSQL(): { sql: string } }) => {
    if (query.toSQL().sql.includes('call_imports'))
      return { data: query.all(), error: mockImportError, loading: false, retry: mockRetry };
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
let t: TestDatabase;
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
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Example', lastName: 'Patient' });
  share('content://example/1', 'Example.m4a');
  delete mockParams.request;
  mockReadError = undefined;
  mockImportError = undefined;
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
    expect(file.mock.calls[1]![1].importId).toBe(file.mock.calls[0]![1].importId);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(picker().props.visible).toBe(false);
    expect(mockSetParams).toHaveBeenCalledWith({ shared: undefined, name: undefined, request: undefined });
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
      const notice = tree.root.findAllByType(ErrorNotice).find((node) => node.props.what === 'فهرست بیماران')!;
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
    expect(file.mock.calls[1]?.[1]).toMatchObject(describeShared('content://example/2', 'Second.m4a'));
    expect(file.mock.calls[1]?.[1]?.importId).toBeTruthy();
    await act(async () => {
      finish('second-note');
    });
  });

  it('keeps the native request identity through screen recreation', async () => {
    mockParams.request = 'b7bd233e-16f3-48a5-a0b5-45327df23686';
    const file = jest.spyOn(queries, 'fileCallRecording').mockRejectedValue(new Error('Synthetic failure'));
    await render();
    await act(async () => {
      picker().props.onSelect({ id: patientId });
    });
    await act(async () => {
      tree.unmount();
    });
    await render();
    await act(async () => {
      picker().props.onSelect({ id: patientId });
    });
    expect(file.mock.calls.map((args) => args[1].importId)).toEqual([mockParams.request, mockParams.request]);
  });

  it('accepts another deliberate share of the same URI with a fresh native request', async () => {
    mockParams.request = 'b7bd233e-16f3-48a5-a0b5-45327df23686';
    const file = jest.spyOn(queries, 'fileCallRecording').mockResolvedValue('saved');
    await render();
    await act(async () => {
      picker().props.onSelect({ id: patientId });
    });
    mockParams.request = '29b3c8b1-edc0-4f40-82b1-ad8ab50aa8a9';
    await refresh();
    expect(picker().props.visible).toBe(true);
    await act(async () => {
      picker().props.onSelect({ id: patientId });
    });
    expect(new Set(file.mock.calls.map((args) => args[1].importId)).size).toBe(2);
  });
});

describe('unfinished imports on the existing calls screen', () => {
  const id = 'b7bd233e-16f3-48a5-a0b5-45327df23686';
  const action = (label: string) => tree.root.findAllByType(Button).find((node) => node.props.label === label)!;
  function putPending(cancelled = false) {
    delete mockParams.shared;
    delete mockParams.name;
    t.db
      .insert(callImports)
      .values({
        id,
        ...stamps(),
        patientId,
        sourceBody: encodeCallSource(describeShared('content://example/1', 'Example.m4a')),
        relativePath: `media/imports/${id}.m4a`,
        state: cancelled ? 'discarding' : 'ready',
        deletedAt: cancelled ? new Date() : null,
      })
      .run();
  }
  it('offers resume after remount without requiring the source picker or repeating patient selection', async () => {
    putPending();
    const resume = jest.spyOn(queries, 'resumeCallImport').mockResolvedValue('saved-note');
    await render();
    expect(picker().props.visible).toBe(false);
    await act(async () => {
      action('ادامهٔ ورود').props.onPress();
    });
    expect(resume).toHaveBeenCalledWith(id);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/patient/[id]/note',
      params: { id: patientId, noteId: 'saved-note' },
    });
  });
  it('disables resume on a read failure but keeps explicit retry visible', async () => {
    putPending();
    mockImportError = new Error('Read failed');
    await render();
    expect(action('ادامهٔ ورود').props.disabled).toBe(true);
    const notice = tree.root.findAllByType(ErrorNotice).find((node) => node.props.what === 'ورودهای ناتمام')!;
    expect(notice.props.error).toBe(mockImportError);
    await act(async () => {
      notice.props.onRetry();
    });
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });
  it('keeps cancelled cleanup retryable without another confirmation or a resume action', async () => {
    putPending(true);
    const cancel = jest.spyOn(queries, 'discardCallImport').mockResolvedValue();
    const confirm = jest.spyOn(Alert, 'alert');
    await render();
    expect(action('ادامهٔ ورود')).toBeUndefined();
    await act(async () => {
      action('پاک‌کردن کپی ناتمام').props.onPress();
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });
  it('requires one confirmation before cancelling and ignores repeated confirmation callbacks', async () => {
    putPending();
    const cancel = jest.spyOn(queries, 'discardCallImport').mockResolvedValue();
    const confirm = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render();
    await act(async () => {
      action('لغو ورود').props.onPress();
    });
    expect(cancel).not.toHaveBeenCalled();
    const yes = confirm.mock.calls[0]![2]!.find((button) => button.style === 'destructive')!.onPress!;
    await act(async () => {
      yes();
      yes();
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('does not enable resume for a deleted patient but keeps cancellation available', async () => {
    putPending();
    await deletePatient(patientId);
    await render();
    expect(action('ادامهٔ ورود').props.disabled).toBe(true);
    expect(action('لغو ورود').props.disabled).toBe(false);
  });
});
