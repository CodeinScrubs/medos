import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Button, Input } from '@/components/ui';
import { VoiceRecorder, type Recording } from '@/components/voice-recorder';
import { attachments, captureInbox, notes } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { CaptureScreen } from './capture/capture-screen';
import { discardNoteDraft, noteDraftQuery } from './notes/draft-queries';
import { NoteEditorScreen } from './notes/note-editor-screen';

let mockParams: Record<string, string>;
const mockBack = jest.fn();
const mockFiles = new Set<string>();
const mockCopies = jest.fn<(uri: string) => Promise<{ relativePath: string; sizeBytes: number }>>();
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[] }) => ({ data: query.all(), error: undefined, retry: jest.fn() }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({ isFocused: () => true }) }));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: () => {} }));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('@/components/quick-date-field', () => ({ QuickDateField: 'QuickDateField' }));
jest.mock('@/components/picker-modal', () => ({ PickerModal: 'PickerModal' }));
jest.mock('@/components/voice-recorder', () => ({ VoiceRecorder: 'VoiceRecorder' }));
jest.mock('@/components/voice-note-player', () => ({ VoiceNotePlayer: 'VoiceNotePlayer' }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  Input: 'Input',
  Row: 'Row',
  Screen: 'Screen',
  SectionHeader: 'SectionHeader',
  SelectField: 'SelectField',
  Text: 'Text',
  Toggle: 'Toggle',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {}, radii: {} }) }));
jest.mock('@/platform/media', () => ({
  extensionOf: () => 'm4a',
  mediaUri: (path: string) => path,
  storeFile: (uri: string) => mockCopies(uri),
  mediaFile: (path: string) => ({
    get exists() {
      return mockFiles.has(path);
    },
    delete: () => mockFiles.delete(path),
  }),
}));
jest.mock('@/platform/import-file', () => ({
  fingerprintRecordingSource: async (uri: string) => {
    if (!mockFiles.has(uri)) throw new Error('Synthetic missing source');
    return { checksum: 'a'.repeat(64), sizeBytes: 3 };
  },
  fingerprintImportFile: async (path: string) => {
    if (!mockFiles.has(path)) throw new Error('Synthetic missing copy');
    return { checksum: 'a'.repeat(64), sizeBytes: 3 };
  },
  copyImportFile: async (uri: string, path: string) => {
    const copied = await mockCopies(uri);
    mockFiles.add(path);
    return { checksum: 'a'.repeat(64), sizeBytes: copied.sizeBytes };
  },
}));
jest.mock('@/features/attachments/capture', () => ({ askPhotoSource: jest.fn(), attachPhotos: jest.fn() }));
jest.mock('@/features/attachments/voice-notes', () => ({ VoiceNotesSection: 'VoiceNotesSection' }));

let t: TestDatabase;
let patientId: string;
let tree: ReactTestRenderer | undefined;
const rec = (): Recording => ({ uri: 'file:///synthetic.m4a', durationMs: 1200 });
async function settle() {
  for (let i = 0; i < 24; i++) await Promise.resolve();
}
async function record(recording: Recording) {
  let result!: Promise<void>;
  await act(async () => {
    result = tree!.root.findByType(VoiceRecorder).props.onRecorded(recording);
    // Attach rejection handling before yielding to React.
    await result.catch(() => undefined);
  });
  return { result };
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Patient' });
  mockParams = { id: patientId };
  mockBack.mockClear();
  mockFiles.clear();
  mockFiles.add(rec().uri);
  mockCopies.mockReset().mockImplementation(async (uri) => {
    if (!mockFiles.has(uri)) throw new Error('Synthetic missing retry source');
    const relativePath = `media/test/staged-${mockCopies.mock.calls.length}.m4a`;
    mockFiles.add(relativePath);
    return { relativePath, sizeBytes: 3 };
  });
  jest.useFakeTimers();
});
afterEach(async () => {
  if (tree)
    await act(async () => {
      tree!.unmount();
      await settle();
    });
  tree = undefined;
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('voice metadata in real editor drafts', () => {
  it('rejects a failed note draft handoff, retries one file, then publishes one voice', async () => {
    await act(async () => {
      tree = create(<NoteEditorScreen />);
    });
    t.sqlite.exec(
      "CREATE TRIGGER fail_note_draft BEFORE INSERT ON note_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    const recording = rec();
    await expect((await record(recording)).result).rejects.toThrow();
    expect(mockFiles.has(recording.uri)).toBe(true);
    expect(await noteDraftQuery(patientId, null)).toHaveLength(0);
    t.sqlite.exec('DROP TRIGGER fail_note_draft');
    await expect((await record(recording)).result).resolves.toBeUndefined();
    expect((await noteDraftQuery(patientId, null))[0]?.voices).toHaveLength(1);
    expect(mockCopies).toHaveBeenCalledTimes(1);
    await act(async () => {
      tree!.root
        .findAllByType(Button)
        .find((node) => node.props.label === 'ثبت در پرونده')!
        .props.onPress();
      await settle();
    });
    expect(t.db.select().from(notes).all()).toHaveLength(1);
    expect(t.db.select().from(attachments).all()).toHaveLength(1);
    expect(await noteDraftQuery(patientId, null)).toHaveLength(0);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('does not acknowledge new voice metadata against a draft retired by another operation', async () => {
    await act(async () => {
      tree = create(<NoteEditorScreen />);
    });
    await act(async () => {
      tree!.root
        .findAllByType(Input)
        .find((node) => node.props.label === 'عنوان')!
        .props.onChangeText('Synthetic draft');
      jest.advanceTimersByTime(850);
      await settle();
    });
    await discardNoteDraft((await noteDraftQuery(patientId, null))[0]!.id);
    const recording = rec();
    await expect((await record(recording)).result).rejects.toThrow();
    expect(mockFiles.has(recording.uri)).toBe(true);
    expect(mockBack).not.toHaveBeenCalled();
    expect(t.db.select().from(attachments).all()).toEqual([]);
  });

  it('retries a voice capture atomically without closing on a failed metadata write', async () => {
    mockParams = { patientId };
    await act(async () => {
      tree = create(<CaptureScreen />);
    });
    t.sqlite.exec(
      "CREATE TRIGGER fail_voice_kind BEFORE UPDATE OF kind ON capture_inbox WHEN NEW.kind = 'voice' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    const recording = rec();
    await expect((await record(recording)).result).rejects.toThrow();
    expect(mockFiles.has(recording.uri)).toBe(true);
    expect(mockBack).not.toHaveBeenCalled();
    expect(t.db.select().from(attachments).all()).toEqual([]);
    expect(t.db.select().from(captureInbox).get()?.kind).toBe('text');
    t.sqlite.exec('DROP TRIGGER fail_voice_kind');
    await expect((await record(recording)).result).resolves.toBeUndefined();
    expect(t.db.select().from(captureInbox).all()).toHaveLength(1);
    expect(t.db.select().from(captureInbox).get()?.kind).toBe('voice');
    expect(t.db.select().from(attachments).get()?.patientId).toBe(patientId);
    expect(mockCopies).toHaveBeenCalledTimes(1);
    // The recorder owns post-ack navigation, after clearing its pending work.
    expect(mockBack).not.toHaveBeenCalled();
    tree!.root.findByType(VoiceRecorder).props.onSaved();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
