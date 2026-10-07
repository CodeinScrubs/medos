import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AutosaveScope } from '@/components/autosave-scope';
import { alertError } from '@/components/feedback';
import { Button, Input, SelectField } from '@/components/ui';
import { VoiceRecorder } from '@/components/voice-recorder';
import { attachments, captureInbox, recordingJobs } from '@/db/schema';
import { askPhotoSource, attachPhotos } from '@/features/attachments/capture';
import { createPatient } from '@/features/patients/queries';
import { DatasetBusyError, DatasetChangedError } from '@/lib/dataset-write';
import type { FileFingerprint } from '@/platform/import-file';
import { databaseRows, replacementFailure, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { CaptureScreen } from './capture-screen';
import { resumeRecording } from '../attachments/recording-queries';

let mockParams: { patientId?: string } = {};
let mockFocused = true;
let mockFlush: (() => Promise<boolean>) | undefined;
let mockCopyBarrier: (() => Promise<void>) | undefined;
const mockFiles = new Map<string, FileFingerprint>();
const mockBack = jest.fn();
const mockNativeJobs: number[] = [];
const fingerprint = { checksum: 'a'.repeat(64), sizeBytes: 321 };
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ back: mockBack }) }));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({ isFocused: () => mockFocused }) }));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[] }) => ({ data: query.all(), retry: jest.fn() }),
}));
jest.mock('@/components/use-save-before-leave', () => ({
  useSaveBeforeLeave: (flush: () => Promise<boolean>) => {
    mockFlush = flush;
  },
}));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('@/components/picker-modal', () => ({ PickerModal: 'PickerModal' }));
jest.mock('@/components/voice-recorder', () => ({ VoiceRecorder: 'VoiceRecorder' }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/features/attachments/recording-recovery', () => ({ RecordingRecovery: 'RecordingRecovery' }));
jest.mock('@/features/attachments/capture', () => ({ askPhotoSource: jest.fn(), attachPhotos: jest.fn() }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Column: 'Column',
  Input: 'Input',
  Row: 'Row',
  Screen: 'Screen',
  SelectField: 'SelectField',
  Text: 'Text',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {}, radii: {} }) }));
jest.mock('@/platform/import-file', () => ({
  fingerprintRecordingSource: async (uri: string) => {
    const { db } = jest.requireActual<typeof import('@/test/db-client')>('@/test/db-client');
    const { recordingJobs } = jest.requireActual<typeof import('@/db/schema')>('@/db/schema');
    mockNativeJobs.push(db.select().from(recordingJobs).all().length);
    const file = mockFiles.get(uri);
    if (!file) throw new Error('Synthetic missing source');
    return { ...file };
  },
  fingerprintImportFile: async (path: string) => {
    const file = mockFiles.get(path);
    if (!file) throw new Error('Synthetic missing copy');
    return { ...file };
  },
  copyImportFile: async (uri: string, path: string) => {
    await mockCopyBarrier?.();
    const file = mockFiles.get(uri);
    if (!file) throw new Error('Synthetic missing source');
    mockFiles.set(path, { ...file });
    return { ...file };
  },
}));
jest.mock('@/platform/media', () => ({
  extensionOf: () => 'm4a',
  mediaFile: (path: string) => ({
    get exists() {
      return mockFiles.has(path);
    },
    delete: () => mockFiles.delete(path),
  }),
  storeFile: async (uri: string) => {
    const { db } = jest.requireActual<typeof import('@/test/db-client')>('@/test/db-client');
    const { recordingJobs } = jest.requireActual<typeof import('@/db/schema')>('@/db/schema');
    mockNativeJobs.push(db.select().from(recordingJobs).all().length);
    await mockCopyBarrier?.();
    const file = mockFiles.get(uri);
    if (!file) throw new Error('Synthetic missing source');
    mockFiles.set('media/test/legacy.m4a', { ...file });
    return { relativePath: 'media/test/legacy.m4a', sizeBytes: file.sizeBytes };
  },
}));

const recording = () => ({
  operationId: '36d8a321-5b69-41f2-b33e-e5bb15c18902',
  uri: 'file:///synthetic-quick-capture.m4a',
  durationMs: 1700,
  capturedAt: new Date('2026-10-07T12:00:00Z'),
});
let t: TestDatabase;
let tree: ReactTestRenderer | undefined;
async function settle() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
async function mount() {
  await act(async () => {
    tree = create(<CaptureScreen />);
    await settle();
  });
}
async function unmount() {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  tree = undefined;
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  mockParams = { patientId: await createPatient({ firstName: 'Synthetic', lastName: 'Capture' }) };
  mockFocused = true;
  mockFlush = undefined;
  mockCopyBarrier = undefined;
  mockBack.mockReset();
  mockNativeJobs.length = 0;
  mockFiles.clear();
  mockFiles.set(recording().uri, { ...fingerprint });
  jest.mocked(askPhotoSource).mockClear();
  jest.mocked(attachPhotos).mockClear();
  jest.mocked(alertError).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.useFakeTimers();
});
afterEach(async () => {
  await unmount();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('quick capture with actual handlers, autosave and migrated SQLite', () => {
  it('acknowledges explicit stopped-voice discard without removing words or its original cache', async () => {
    await mount();
    await act(async () => {
      tree!.root.findByType(Input).props.onChangeText('Synthetic retained text');
      await mockFlush!();
    });
    t.sqlite.exec(
      "CREATE TRIGGER fail_voice BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT, 'Synthetic publication'); END;",
    );
    const props = tree!.root.findByType(VoiceRecorder).props;
    await act(async () => {
      await expect(props.onRecorded(recording())).rejects.toThrow();
    });
    const path = t.db.select().from(recordingJobs).get()!.relativePath;
    await act(async () => {
      await props.onDiscarded(recording());
    });
    expect(t.db.select().from(recordingJobs).get()).toMatchObject({ state: 'discarded', attachmentId: null });
    expect(mockFiles.has(path)).toBe(false);
    expect(mockFiles.has(recording().uri)).toBe(true);
    expect(t.db.select().from(captureInbox).get()).toMatchObject({ text: 'Synthetic retained text', deletedAt: null });
    expect(t.db.select().from(attachments).all()).toEqual([]);
    t.sqlite.exec('DROP TRIGGER fail_voice');
  });

  it('fences a delayed photo choice and confirms stale close locally without deleting restored rows', async () => {
    await mount();
    await act(async () => {
      tree!.root.findByType(Input).props.onChangeText('Synthetic original text');
      await mockFlush!();
    });
    const oldPatientLabel = tree!.root.findByType(SelectField).props.value;
    await act(async () => {
      tree!.root
        .findAllByType(Button)
        .find((n) => n.props.label === 'عکس')!
        .props.onPress();
    });
    const pick = jest.mocked(askPhotoSource).mock.calls[0]![0];
    await act(async () => {
      snapshotDataset(t)();
      await settle();
    });
    const before = databaseRows(t);
    await act(async () => {
      pick('library');
      await settle();
    });
    expect(attachPhotos).not.toHaveBeenCalled();
    expect(alertError).toHaveBeenCalledWith('عکس ذخیره نشد', expect.any(DatasetChangedError));
    expect(tree!.root.findByType(Input).props.value).toBe('Synthetic original text');
    expect(tree!.root.findByType(SelectField).props.value).toBe(oldPatientLabel);
    await act(async () => {
      tree!.root
        .findAllByType(Button)
        .find((n) => n.props.label === 'بستن فرم قبلی')!
        .props.onPress();
    });
    const choices = jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
    expect(mockBack).not.toHaveBeenCalled();
    await act(async () => {
      choices.find((c) => c.text === 'بستن فرم')!.onPress!();
      await settle();
    });
    await unmount();
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(databaseRows(t)).toEqual(before);
  });
  it('journals stopped voice before native IO and retains ready bytes across unmount/recovery without cache', async () => {
    await mount();
    t.sqlite.exec(
      "CREATE TRIGGER fail_voice BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT, 'Synthetic publication'); END;",
    );
    await act(async () => {
      await expect(tree!.root.findByType(VoiceRecorder).props.onRecorded(recording())).rejects.toThrow();
    });
    expect(mockNativeJobs[0]).toBe(1);
    expect(t.db.select().from(recordingJobs).get()).toMatchObject({ state: 'ready', attachmentId: null });
    expect(t.db.select().from(attachments).all()).toEqual([]);
    await unmount();
    expect(t.db.select().from(captureInbox).get()?.deletedAt).toBeNull();
    t.sqlite.exec('DROP TRIGGER fail_voice');
    mockFiles.delete(recording().uri);
    const attachmentId = await resumeRecording(recording().operationId, new Date('2026-10-07T12:01:00Z'));
    expect(await resumeRecording(recording().operationId, new Date('2026-10-07T12:02:00Z'))).toBe(attachmentId);
    expect(t.db.select().from(attachments).all()).toHaveLength(1);
    expect(t.db.select().from(captureInbox).get()?.kind).toBe('voice');
  });

  it('refuses retained voice callbacks after identical-row restore before native IO or any SQL write', async () => {
    await mount();
    const props = tree!.root.findByType(VoiceRecorder).props;
    await act(async () => {
      snapshotDataset(t)();
      await settle();
    });
    const before = databaseRows(t);
    await act(async () => {
      await expect(props.onRecorded(recording())).rejects.toThrow(DatasetChangedError);
    });
    expect(mockNativeJobs).toEqual([]);
    expect(databaseRows(t)).toEqual(before);
    expect(tree!.root.findAllByType(VoiceRecorder)).toHaveLength(0);
  });

  it('holds dataset admission through copying, saves the latest text, and never closes a newer route', async () => {
    let release: () => void = () => {
      throw new Error('Copy not started');
    };
    mockCopyBarrier = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    await mount();
    const props = tree!.root.findByType(VoiceRecorder).props;
    let work: Promise<void>;
    await act(async () => {
      work = props.onRecorded(recording());
      await settle();
    });
    expect(replacementFailure()).toBeInstanceOf(DatasetBusyError);
    await act(async () => {
      tree!.root.findByType(Input).props.onChangeText('Synthetic newest text');
      mockFocused = false;
      release();
      await work!;
    });
    props.onSaved();
    expect(mockBack).not.toHaveBeenCalled();
    expect(t.db.select().from(captureInbox).get()?.text).toBe('Synthetic newest text');
    expect(t.db.select().from(attachments).all()).toHaveLength(1);
    expect(tree!.root.findByType(AutosaveScope)).toBeDefined();
    expect(await mockFlush!()).toBe(true);
  });
});
