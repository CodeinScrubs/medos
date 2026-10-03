import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { Button, Input } from '@/components/ui';
import { restoreDatabase } from '@/db/client';
import { noteDrafts, notes, orders } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { OrderFormScreen } from '@/features/kardex/order-form-screen';
import { createOrder } from '@/features/kardex/queries';
import { createPatient } from '@/features/patients/queries';
import { DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { writeNoteDraft, type NoteDraftFields } from './draft-queries';
import { NoteEditorScreen } from './note-editor-screen';
import { createNote } from './queries';

let mockParams: { id: string; noteId?: string; orderId?: string };
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[] }) => ({ data: query.all(), retry: jest.fn() }),
}));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: jest.fn() }));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/quick-date-field', () => ({ QuickDateField: 'QuickDateField' }));
jest.mock('@/components/picker-modal', () => ({ PickerModal: 'PickerModal' }));
jest.mock('@/components/voice-note-player', () => ({ VoiceNotePlayer: 'VoiceNotePlayer' }));
jest.mock('@/components/voice-recorder', () => ({ VoiceRecorder: 'VoiceRecorder' }));
jest.mock('@/features/attachments/voice-notes', () => ({ VoiceNotesSection: 'VoiceNotesSection' }));
jest.mock('@/features/attachments/recordings', () => ({ stageRecording: jest.fn() }));
jest.mock('@/features/patients/patient-header', () => ({ AllergyBanner: 'AllergyBanner' }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  EmptyState: 'EmptyState',
  IconButton: 'IconButton',
  Input: 'Input',
  Row: 'Row',
  Screen: 'Screen',
  SectionHeader: 'SectionHeader',
  SelectField: 'SelectField',
  Text: 'Text',
  Toggle: 'Toggle',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, radii: {}, spacing: {} }) }));
jest.mock('@/platform/media', () => ({ mediaUri: (value: string) => value }));

let t: TestDatabase;
let patientId: string;
let tree: ReactTestRenderer | undefined;
let snapshotCounter = 0;
let path: string;
const fields: NoteDraftFields = {
  type: 'general',
  title: null,
  body: 'Restored words',
  subjective: null,
  objective: null,
  assessment: null,
  plan: null,
  noteDate: new Date('2026-09-23T10:00:00Z'),
  doctorId: null,
  specialty: null,
  isPinned: false,
  isDraft: false,
  voices: [],
};
const input = (label: string) => tree!.root.findAllByType(Input).find((node) => node.props.label === label)!;
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
async function settle() {
  for (let i = 0; i < 24; i++) await Promise.resolve();
}
function snapshot() {
  path = `/intent-${++snapshotCounter}.db`;
  t.sqlite.exec(`VACUUM INTO '${path}'`);
}
function replace() {
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
}

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Intent' });
  mockParams = { id: patientId };
  mockBack.mockClear();
  jest.mocked(alertError).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.useFakeTimers();
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  tree = undefined;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('mounted note and order intents across real same-ID SQL import', () => {
  it('keeps pending note text visible but rejects timer, Save and cleanup writes into a restored same-ID draft', async () => {
    const noteId = await createNote({ patientId, type: 'general', body: fields.body });
    await writeNoteDraft('draft', { patientId, noteId }, fields);
    snapshot();
    await writeNoteDraft('draft', { patientId, noteId }, { ...fields, body: 'Current words' });
    mockParams.noteId = noteId;
    await act(async () => {
      tree = create(<NoteEditorScreen />);
    });
    await act(async () => {
      input('متن نوت').props.onChangeText('Unsaved old intent');
    });
    await act(async () => {
      replace();
    });
    expect(input('متن نوت').props.value).toBe('Unsaved old intent');
    expect(button('ثبت در پرونده').props.disabled).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(4000);
      await settle();
      button('ثبت در پرونده').props.onPress();
      await settle();
    });
    expect(jest.mocked(alertError)).toHaveBeenCalledWith('ذخیره نشد', expect.any(DatasetChangedError));
    expect(t.db.select().from(noteDrafts).get()!.body).toBe(fields.body);
    expect(t.db.select().from(notes).get()!.body).toBe(fields.body);
    await act(async () => {
      tree!.unmount();
      await settle();
    });
    tree = undefined;
    expect(t.db.select().from(noteDrafts).get()!.body).toBe(fields.body);
  });

  it('does not insert the first draft of an old new-note editor after replacement', async () => {
    snapshot();
    await act(async () => {
      tree = create(<NoteEditorScreen />);
    });
    await act(async () => {
      input('Subjective').props.onChangeText('Unacknowledged new note');
    });
    await act(async () => {
      replace();
      jest.advanceTimersByTime(4000);
      await settle();
    });
    expect(input('Subjective').props.value).toBe('Unacknowledged new note');
    expect(t.db.select().from(noteDrafts).all()).toHaveLength(0);
    expect(t.db.select().from(notes).all()).toHaveLength(0);
  });

  it('retains a removed note seed and closes only the local stale intent without deleting the restored draft', async () => {
    const noteId = await createNote({ patientId, type: 'general', body: fields.body });
    await writeNoteDraft('draft', { patientId, noteId }, fields);
    snapshot();
    mockParams.noteId = noteId;
    await act(async () => {
      tree = create(<NoteEditorScreen />);
    });
    await act(async () => {
      input('متن نوت').props.onChangeText('Review before closing');
    });
    await act(async () => {
      replace();
    });
    await act(async () => {
      button('انصراف').props.onPress();
    });
    const dialog = jest.mocked(Alert.alert).mock.calls.at(-1)!;
    await act(async () => {
      dialog[2]!.find((item) => item.text === 'بستن فرم')!.onPress!();
      await settle();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(t.db.select().from(noteDrafts).get()!.deletedAt).toBeNull();
    expect(t.db.select().from(noteDrafts).get()!.body).toBe(fields.body);
  });

  it('retains typed text when the imported database contains no matching note', async () => {
    snapshot();
    const noteId = await createNote({ patientId, type: 'general', body: 'Current note' });
    mockParams.noteId = noteId;
    await act(async () => {
      tree = create(<NoteEditorScreen />);
    });
    await act(async () => {
      input('متن نوت').props.onChangeText('Only mounted copy');
      replace();
    });
    expect(input('متن نوت').props.value).toBe('Only mounted copy');
    expect(t.db.select().from(notes).all()).toHaveLength(0);
  });

  it('rejects the actual old order Save handler after restoring the same ID with another dose', async () => {
    const id = await createOrder({ patientId, kind: 'drug', name: 'Synthetic order', dose: '500 mg' });
    snapshot();
    await t.db.update(orders).set({ dose: '250 mg' }).where(eq(orders.id, id));
    mockParams.orderId = id;
    await act(async () => {
      tree = create(<OrderFormScreen />);
    });
    const dose = tree!.root.findAllByType(Input).find((node) => node.props.value === '250 mg')!;
    await act(async () => {
      dose.props.onChangeText('125 mg');
      replace();
    });
    expect(tree!.root.findAllByType(Input).some((node) => node.props.value === '125 mg')).toBe(true);
    expect(button('ذخیره').props.disabled).toBe(true);
    await act(async () => {
      button('ذخیره').props.onPress();
      await settle();
    });
    expect(t.db.select().from(orders).get()!.dose).toBe('500 mg');
    expect(jest.mocked(alertError)).toHaveBeenCalledWith('ذخیره نشد', expect.any(DatasetChangedError));
    expect(mockBack).not.toHaveBeenCalled();
  });
});
