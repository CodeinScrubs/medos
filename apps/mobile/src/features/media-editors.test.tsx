import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { notify } from '@/components/feedback';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Column, Input } from '@/components/ui';
import { VoiceRecorder, type Recording } from '@/components/voice-recorder';
import { attachments, captureInbox, noteDrafts, notes, recordingJobs } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { reserveDatasetReplacement } from '@/lib/dataset-write';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { CaptureScreen } from './capture/capture-screen';
import * as noteCommit from './notes/commit-queries';
import * as noteDraftQueries from './notes/draft-queries';
import { discardNoteDraft, noteDraftQuery } from './notes/draft-queries';
import { NoteEditorScreen } from './notes/note-editor-screen';

let mockParams: Record<string, string>;
let mockFocused = true;
const mockBack = jest.fn();
const mockNavigation = { isFocused: () => mockFocused, setOptions: jest.fn() };
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
  useNavigation: () => mockNavigation,
}));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => mockNavigation }));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: () => {} }));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAwareScrollView: jest.requireActual<typeof import('react-native')>('react-native').ScrollView,
}));
jest.mock('@/components/quick-date-field', () => ({ QuickDateField: 'QuickDateField' }));
jest.mock('@/components/picker-modal', () => ({ PickerModal: 'PickerModal' }));
jest.mock('@/components/voice-recorder', () => ({ VoiceRecorder: 'VoiceRecorder' }));
jest.mock('@/components/voice-note-player', () => ({ VoiceNotePlayer: 'VoiceNotePlayer' }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  ChipSelect: 'ChipSelect',
  Column: jest.requireActual<typeof import('@/components/ui/layout')>('@/components/ui/layout').Column,
  Input: 'Input',
  Row: 'Row',
  Screen: jest.requireActual<typeof import('@/components/ui/layout')>('@/components/ui/layout').Screen,
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
// Keep the real generic handoff and query list; only native recorder/player are stand-ins.

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
  mockNavigation.setOptions.mockClear();
  jest.mocked(notify).mockClear();
  mockFocused = true;
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
  jest.restoreAllMocks();
});

describe('voice metadata in real editor drafts', () => {
  it.each(['publication', 'discard'] as const)(
    'keeps the native form parent and screen header mounted through pending %s and close',
    async (action) => {
      await act(async () => {
        tree = create(<NoteEditorScreen />);
      });
      const header = tree!.root.findByType(ScreenOptions);
      const formHost = () => tree!.root.findAllByType(Column)[0]!.findByType(View);
      const parent = formHost();
      // Fabric must retain this View even when pointerEvents changes during
      // native close; Android may still retain the outgoing children's parents.
      expect(parent.props.collapsable).toBe(false);
      expect(parent.props.pointerEvents).toBe('auto');
      expect(mockNavigation.setOptions).toHaveBeenCalledTimes(1);
      await act(async () => {
        tree!.root
          .findAllByType(Input)
          .find((node) => node.props.label === 'عنوان')!
          .props.onChangeText('Synthetic header witness');
      });
      const dialog = jest.spyOn(Alert, 'alert');
      let release!: () => void;
      const acknowledgment = new Promise<void>((resolve) => {
        release = resolve;
      });
      if (action === 'publication') {
        const commit = noteCommit.commitNoteDraft;
        jest.spyOn(noteCommit, 'commitNoteDraft').mockImplementation(async (...args) => {
          const id = await commit(...args);
          await acknowledgment;
          return id;
        });
      } else {
        const discard = noteDraftQueries.discardNoteDraft;
        jest.spyOn(noteDraftQueries, 'discardNoteDraft').mockImplementation(async (...args) => {
          await discard(...args);
          await acknowledgment;
        });
      }
      try {
        await act(async () => {
          tree!.root
            .findAllByType(Button)
            .find((node) => node.props.label === (action === 'publication' ? 'ثبت در پرونده' : 'انصراف'))!
            .props.onPress();
          if (action === 'discard') {
            dialog.mock.calls.at(-1)![2]!.find((button) => button.text === 'دور بریز')!.onPress!();
          }
          await settle();
        });
        expect(mockBack).not.toHaveBeenCalled();
        expect(formHost()).toBe(parent);
        expect(parent.props.collapsable).toBe(false);
        expect(parent.props.pointerEvents).toBe('none');
      } finally {
        await act(async () => {
          release();
          await settle();
        });
      }
      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(formHost()).toBe(parent);
      expect(parent.props.collapsable).toBe(false);
      expect(mockNavigation.setOptions).toHaveBeenCalledTimes(1);
      expect(tree!.root.findByType(ScreenOptions)).toBe(header);
    },
  );

  it('keeps the draft editable after publication fails and publishes the later correction on retry', async () => {
    await act(async () => {
      tree = create(<NoteEditorScreen />);
    });
    const formHost = () => tree!.root.findAllByType(Column)[0]!.findByType(View);
    const parent = formHost();
    const title = () => tree!.root.findAllByType(Input).find((node) => node.props.label === 'عنوان')!;
    const save = () =>
      tree!.root
        .findAllByType(Button)
        .find((node) => node.props.label === 'ثبت در پرونده')!
        .props.onPress();
    await act(async () => title().props.onChangeText('First title'));
    t.sqlite.exec(
      "CREATE TRIGGER fail_note BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await act(async () => {
      save();
      await settle();
    });
    expect(t.db.select().from(notes).all()).toEqual([]);
    expect(title().props.editable).toBe(true);
    expect(formHost()).toBe(parent);
    expect(parent.props.collapsable).toBe(false);
    expect(parent.props.pointerEvents).toBe('auto');
    expect((await noteDraftQuery(patientId, null))[0]?.title).toBe('First title');
    t.sqlite.exec('DROP TRIGGER fail_note');
    await act(async () => title().props.onChangeText('Corrected title'));
    await act(async () => {
      save();
      await settle();
    });
    expect(t.db.select().from(notes).get()?.title).toBe('Corrected title');
    expect(formHost()).toBe(parent);
    expect(parent.props.collapsable).toBe(false);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('keeps the submitted fields read-only while final publication acknowledgment is pending', async () => {
    await act(async () => {
      tree = create(<NoteEditorScreen />);
    });
    const title = () => tree!.root.findAllByType(Input).find((node) => node.props.label === 'عنوان')!;
    await act(async () => title().props.onChangeText('Submitted title'));
    const originalCommit = noteCommit.commitNoteDraft;
    let release!: () => void;
    const acknowledgment = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.spyOn(noteCommit, 'commitNoteDraft').mockImplementation(async (...args) => {
      const id = await originalCommit(...args);
      await acknowledgment;
      return id;
    });
    try {
      await act(async () => {
        tree!.root
          .findAllByType(Button)
          .find((node) => node.props.label === 'ثبت در پرونده')!
          .props.onPress();
        await settle();
      });
      expect(t.db.select().from(notes).get()?.title).toBe('Submitted title');
      expect(title().props.editable).toBe(false);
      // A retained callback cannot accept an edit into the already-retired draft.
      await act(async () => title().props.onChangeText('Too late'));
      expect(title().props.value).toBe('Submitted title');
      expect(t.db.select().from(notes).get()?.title).toBe('Submitted title');
    } finally {
      await act(async () => {
        release();
        await settle();
      });
    }
  });

  it('does not report a successful keep-draft operation as failed after another route gains focus', async () => {
    await act(async () => {
      tree = create(<NoteEditorScreen />);
    });
    await act(async () => {
      tree!.root
        .findAllByType(Input)
        .find((node) => node.props.label === 'عنوان')!
        .props.onChangeText('Kept title');
    });
    const dialog = jest.spyOn(Alert, 'alert');
    await act(async () => {
      tree!.root
        .findAllByType(Button)
        .find((node) => node.props.label === 'انصراف')!
        .props.onPress();
    });
    const keep = dialog.mock.calls.at(-1)![2]!.find((button) => button.text === 'نگه دار')!.onPress!;
    mockFocused = false;
    await act(async () => {
      keep();
      await settle();
    });
    expect((await noteDraftQuery(patientId, null))[0]?.title).toBe('Kept title');
    expect(mockBack).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not close a newer route after note publication acknowledges and cannot republish the retired draft', async () => {
    await act(async () => {
      tree = create(<NoteEditorScreen />);
    });
    await act(async () => {
      tree!.root
        .findAllByType(Input)
        .find((node) => node.props.label === 'عنوان')!
        .props.onChangeText('Late note');
    });
    const originalCommit = noteCommit.commitNoteDraft;
    jest.spyOn(noteCommit, 'commitNoteDraft').mockImplementation(async (...args) => {
      const id = await originalCommit(...args);
      mockFocused = false;
      return id;
    });
    const savedAction = tree!.root.findAllByType(Button).find((node) => node.props.label === 'ثبت در پرونده')!.props
      .onPress;
    await act(async () => {
      savedAction();
      await settle();
    });
    expect(t.db.select().from(notes).all()).toHaveLength(1);
    expect(mockBack).not.toHaveBeenCalled();
    await act(async () => {
      savedAction();
      await settle();
    });
    expect(t.db.select().from(notes).all()).toHaveLength(1);
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('persists the original text and recording journal before the first draft voice IO', async () => {
    await act(async () => {
      tree = create(<NoteEditorScreen />);
      await settle();
    });
    await act(async () => {
      tree!.root
        .findAllByType(Input)
        .find((node) => node.props.label === 'عنوان')!
        .props.onChangeText('Original capture');
    });
    mockCopies.mockImplementationOnce(async () => {
      const draft = t.db.select().from(noteDrafts).get();
      expect(draft?.title).toBe('Original capture');
      expect(t.db.select().from(recordingJobs).all()).toHaveLength(1);
      expect(t.db.select().from(recordingJobs).get()).toMatchObject({
        entityType: 'note_draft',
        entityId: draft?.id,
        patientId,
      });
      const relativePath = 'media/test/native-stand-in.m4a';
      mockFiles.add(relativePath);
      return { relativePath, sizeBytes: 3 };
    });
    await expect((await record(rec())).result).resolves.toBeUndefined();
  });
  it('holds original dataset admission through draft voice copying and keeps newer typing', async () => {
    await act(async () => {
      tree = create(<NoteEditorScreen />);
    });
    mockCopies.mockImplementationOnce(async () => {
      let granted: ReturnType<typeof reserveDatasetReplacement> | undefined;
      try {
        granted = reserveDatasetReplacement();
      } catch {
        /* Original write must retain admission. */
      }
      granted?.release();
      expect(granted).toBeUndefined();
      tree!.root
        .findAllByType(Input)
        .find((node) => node.props.label === 'عنوان')!
        .props.onChangeText('Typed during copy');
      const relativePath = 'media/test/native-stand-in.m4a';
      mockFiles.add(relativePath);
      return { relativePath, sizeBytes: 3 };
    });
    await expect((await record(rec())).result).resolves.toBeUndefined();
    expect((await noteDraftQuery(patientId, null))[0]?.title).toBe('Typed during copy');
    expect(t.db.select().from(attachments).all()).toHaveLength(1);
  });
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
    const draft = (await noteDraftQuery(patientId, null))[0]!;
    expect(draft.voices).toEqual([]);
    expect(t.db.select().from(attachments).get()).toMatchObject({
      entityType: 'note_draft',
      entityId: draft.id,
      patientId,
    });
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
