import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { Alert, Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, EmptyState, Input, Text } from '@/components/ui';
import { restoreDatabase } from '@/db/client';
import { noteDrafts, notes, orders, patients } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { OrderFormScreen } from '@/features/kardex/order-form-screen';
import { createOrder } from '@/features/kardex/queries';
import * as orderQueries from '@/features/kardex/queries';
import { createPatient } from '@/features/patients/queries';
import { DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';
import { softDelete } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { writeNoteDraft, type NoteDraftFields } from './draft-queries';
import { NoteEditorScreen } from './note-editor-screen';
import { NoteHistoryScreen } from './note-history-screen';
import { createNote, updateNote } from './queries';
import * as noteQueries from './queries';

let mockParams: { id: string; noteId?: string; orderId?: string };
const mockBack = jest.fn();
const mockDismissTo = jest.fn();
let mockFocused = true;
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, push: jest.fn(), dismissTo: mockDismissTo }),
}));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({ isFocused: () => mockFocused }) }));
jest.mock('react-native', () => {
  const native = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy(native, { get: (target, key) => (key === 'Pressable' ? 'Pressable' : Reflect.get(target, key)) });
});
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
jest.mock('@/features/patients/patient-header', () => ({ AllergyBanner: 'AllergyBanner' }));
jest.mock('@/components/ui', () => ({
  Badge: 'Badge',
  Button: 'Button',
  Card: 'Card',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  Divider: 'Divider',
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
  mockFocused = true;
  mockBack.mockClear();
  mockDismissTo.mockClear();
  jest.mocked(alertError).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.useFakeTimers();
});

describe('actual manual order form identity, pending publication and optional suggestions', () => {
  it('an initial mismatched deep link cannot seed the other patient’s order', async () => {
    const other = await createPatient({ firstName: 'Synthetic', lastName: 'Foreign route' });
    const id = await createOrder({ patientId: other, kind: 'drug', name: 'Synthetic foreign order' });
    mockParams.orderId = id;
    await act(async () => {
      tree = create(<OrderFormScreen />);
      await settle();
    });
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(1);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('route reuse retains original input and allergy context but refuses an old Save handler', async () => {
    const id = await createOrder({ patientId, kind: 'drug', name: 'Synthetic original', dose: '1 g' });
    mockParams.orderId = id;
    await act(async () => {
      tree = create(<OrderFormScreen />);
      await settle();
    });
    await act(async () => input('دوز').props.onChangeText('2 g'));
    const old = button('ذخیره').props.onPress;
    const other = await createPatient({ firstName: 'Synthetic', lastName: 'New route' });
    mockParams = { id: other };
    await act(async () => {
      tree!.update(<OrderFormScreen />);
      await settle();
    });
    expect(input('دوز').props.value).toBe('2 g');
    expect(input('دوز').props.editable).toBe(false);
    expect(button('ذخیره').props.disabled).toBe(true);
    await act(async () => {
      old();
      await settle();
    });
    expect(t.db.select().from(orders).where(eq(orders.id, id)).get()!.dose).toBe('1 g');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('refuses to overwrite a concurrent same-timestamp dose correction', async () => {
    const id = await createOrder({ patientId, kind: 'drug', name: 'Synthetic concurrent', dose: '1 g' });
    mockParams.orderId = id;
    await act(async () => {
      tree = create(<OrderFormScreen />);
      await settle();
    });
    await act(async () => input('یادداشت').props.onChangeText('Synthetic new note'));
    t.db.update(orders).set({ dose: '3 g' }).where(eq(orders.id, id)).run();
    await act(async () => {
      button('ذخیره').props.onPress();
      await settle();
    });
    const current = t.db.select().from(orders).where(eq(orders.id, id)).get()!;
    expect(current).toMatchObject({ dose: '3 g', notes: null });
    expect(input('یادداشت').props.value).toBe('Synthetic new note');
    expect(alertError).toHaveBeenCalledWith('ذخیره نشد', expect.any(Error));
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('pending publication locks callbacks and closes only the originating focused route', async () => {
    const id = await createOrder({ patientId, kind: 'drug', name: 'Synthetic pending', dose: '1 g' });
    mockParams.orderId = id;
    await act(async () => {
      tree = create(<OrderFormScreen />);
      await settle();
    });
    await act(async () => input('دوز').props.onChangeText('2 g'));
    let acknowledge!: () => void;
    const pending = new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    const update = orderQueries.updateOrder;
    const writes = jest.spyOn(orderQueries, 'updateOrder').mockImplementation(async (...args) => {
      await pending;
      await update(...args);
    });
    const save = button('ذخیره').props.onPress;
    const cancel = button('انصراف').props.onPress;
    const oldDose = input('دوز').props.onChangeText;
    await act(async () => {
      save();
      save();
      cancel();
      oldDose('99 g');
      await settle();
    });
    expect(writes).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
    expect(input('دوز').props.value).toBe('2 g');
    expect(input('دوز').props.editable).toBe(false);
    expect(button('انصراف').props.disabled).toBe(true);
    mockFocused = false;
    await act(async () => {
      acknowledge();
      await settle();
    });
    expect(t.db.select().from(orders).where(eq(orders.id, id)).get()!.dose).toBe('2 g');
    expect(mockBack).not.toHaveBeenCalled();
    expect(input('دوز').props.editable).toBe(false);
    expect(button('بستن')).toBeDefined();
    await act(async () => button('بستن').props.onPress());
    expect(mockBack).not.toHaveBeenCalled();
    mockFocused = true;
    await act(async () => button('بستن').props.onPress());
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('does not invent a start time on an unrelated edit to a legacy unknown-start order', async () => {
    const id = await createOrder({ patientId, kind: 'drug', name: 'Synthetic unknown', startAt: null });
    mockParams.orderId = id;
    await act(async () => {
      tree = create(<OrderFormScreen />);
      await settle();
    });
    expect(tree!.root.findAllByType(Text).some((node) => node.props.children === 'زمان شروع ثبت نشده است.')).toBe(true);
    await act(async () => input('یادداشت').props.onChangeText('Synthetic unrelated edit'));
    await act(async () => {
      button('ذخیره').props.onPress();
      await settle();
    });
    expect(t.db.select().from(orders).where(eq(orders.id, id)).get()!).toMatchObject({
      startAt: null,
      notes: 'Synthetic unrelated edit',
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('optional suggestions report read failure and retry without losing typed input', async () => {
    const suggestions = jest
      .spyOn(orderQueries, 'suggestOrderNames')
      .mockRejectedValue(new Error('Synthetic lookup failure'));
    await act(async () => {
      tree = create(<OrderFormScreen />);
      await settle();
    });
    await act(async () => {
      input('نام دارو').props.onChangeText('Synthetic typed');
      await settle();
    });
    const notice = tree!.root.findAllByType(ErrorNotice).find((node) => node.props.what === 'پیشنهادهای کاردکس')!;
    expect(notice.props.error).toBeInstanceOf(Error);
    expect(input('نام دارو').props.value).toBe('Synthetic typed');
    suggestions.mockResolvedValue([]);
    await act(async () => {
      notice.props.onRetry();
      await settle();
    });
    expect(
      tree!.root.findAllByType(ErrorNotice).find((node) => node.props.what === 'پیشنهادهای کاردکس')!.props.error,
    ).toBeUndefined();
    expect(input('نام دارو').props.value).toBe('Synthetic typed');
  });

  it.each(['dose', 'name'] as const)('a delayed suggestion cannot overwrite a later manual %s edit', async (field) => {
    const candidate = await createOrder({
      patientId,
      kind: 'fluid',
      name: 'Synthetic candidate',
      dose: '1000 cc',
      route: 'IV',
      rate: '40 cc/h',
    });
    const previous = t.db.select().from(orders).where(eq(orders.id, candidate)).get()!;
    jest.spyOn(orderQueries, 'suggestOrderNames').mockResolvedValue([previous.name]);
    let release!: (value: typeof previous) => void;
    const pending = new Promise<typeof previous>((resolve) => {
      release = resolve;
    });
    jest.spyOn(orderQueries, 'lastOrderNamed').mockReturnValue(pending);
    await act(async () => {
      tree = create(<OrderFormScreen />);
      await settle();
    });
    const picked = tree!.root
      .findAllByType(Pressable)
      .find((node) => node.findAllByType(Text).some((text) => text.props.children === previous.name))!;
    await act(async () => {
      picked.props.onPress();
      await settle();
    });
    await act(async () => {
      if (field === 'dose') input('دوز').props.onChangeText('125 mg');
      else input('نام دارو').props.onChangeText('Synthetic newer name');
      release(previous);
      await settle();
    });
    expect(input('نام دارو').props.value).toBe(field === 'dose' ? previous.name : 'Synthetic newer name');
    expect(input('دوز').props.value).toBe(field === 'dose' ? '125 mg' : '');
    expect(tree!.root.findAllByType(Input).some((node) => node.props.label === 'سرعت')).toBe(false);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('only the latest of two deferred selections may prefill the draft', async () => {
    const first = await createOrder({ patientId, kind: 'drug', name: 'Synthetic first', dose: '1 g' });
    const second = await createOrder({ patientId, kind: 'drug', name: 'Synthetic second', dose: '2 g' });
    const firstRow = t.db.select().from(orders).where(eq(orders.id, first)).get()!;
    const secondRow = t.db.select().from(orders).where(eq(orders.id, second)).get()!;
    jest.spyOn(orderQueries, 'suggestOrderNames').mockResolvedValue([firstRow.name, secondRow.name]);
    let releaseFirst!: (value: typeof firstRow) => void, releaseSecond!: (value: typeof secondRow) => void;
    const p1 = new Promise<typeof firstRow>((resolve) => {
      releaseFirst = resolve;
    });
    const p2 = new Promise<typeof secondRow>((resolve) => {
      releaseSecond = resolve;
    });
    jest.spyOn(orderQueries, 'lastOrderNamed').mockImplementation((name) => (name === firstRow.name ? p1 : p2));
    await act(async () => {
      tree = create(<OrderFormScreen />);
      await settle();
    });
    const pick = (name: string) =>
      tree!.root
        .findAllByType(Pressable)
        .find((node) => node.findAllByType(Text).some((text) => text.props.children === name))!;
    await act(async () => {
      pick(firstRow.name).props.onPress();
      await settle();
    });
    await act(async () => {
      pick(secondRow.name).props.onPress();
      await settle();
    });
    await act(async () => {
      releaseSecond(secondRow);
      await settle();
      releaseFirst(firstRow);
      await settle();
    });
    expect(input('نام دارو').props.value).toBe(secondRow.name);
    expect(input('دوز').props.value).toBe('2 g');
  });

  it('a deferred suggestion cannot change a draft after same-ID dataset replacement', async () => {
    const candidate = await createOrder({ patientId, kind: 'drug', name: 'Synthetic late source', dose: '5 g' });
    const previous = t.db.select().from(orders).where(eq(orders.id, candidate)).get()!;
    snapshot();
    jest.spyOn(orderQueries, 'suggestOrderNames').mockResolvedValue([previous.name]);
    let release!: (value: typeof previous) => void;
    jest.spyOn(orderQueries, 'lastOrderNamed').mockReturnValue(
      new Promise<typeof previous>((resolve) => {
        release = resolve;
      }),
    );
    await act(async () => {
      tree = create(<OrderFormScreen />);
      await settle();
    });
    const picked = tree!.root
      .findAllByType(Pressable)
      .find((node) => node.findAllByType(Text).some((text) => text.props.children === previous.name))!;
    await act(async () => {
      picked.props.onPress();
      await settle();
      replace();
      release(previous);
      await settle();
    });
    expect(input('دوز').props.value).toBe('');
    expect(button('افزودن به کاردکس').props.disabled).toBe(true);
    expect(t.db.select().from(orders).all()).toEqual([previous]);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it.each(['order', 'patient'] as const)('keeps local input when the %s is deleted during editing', async (kind) => {
    const id = await createOrder({ patientId, kind: 'drug', name: 'Synthetic removed parent', dose: '1 g' });
    mockParams.orderId = id;
    await act(async () => {
      tree = create(<OrderFormScreen />);
      await settle();
    });
    await act(async () => input('یادداشت').props.onChangeText('Only unsaved local words'));
    const oldSave = button('ذخیره').props.onPress;
    if (kind === 'order') t.db.update(orders).set(softDelete()).where(eq(orders.id, id)).run();
    else {
      t.db.update(patients).set(softDelete()).where(eq(patients.id, patientId)).run();
    }
    const before = t.db.select().from(orders).all();
    await act(async () => {
      tree!.update(<OrderFormScreen />);
      await settle();
    });
    expect(input('یادداشت').props.value).toBe('Only unsaved local words');
    expect(button('ذخیره').props.disabled).toBe(true);
    await act(async () => {
      oldSave();
      await settle();
    });
    expect(t.db.select().from(orders).all()).toEqual(before);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('failed prefill remains separate from a successful prefix read and retries the same request', async () => {
    const candidate = await createOrder({ patientId, kind: 'drug', name: 'Synthetic retry detail', dose: '2 g' });
    const previous = t.db.select().from(orders).where(eq(orders.id, candidate)).get()!;
    jest.spyOn(orderQueries, 'suggestOrderNames').mockResolvedValue([previous.name]);
    const read = jest
      .spyOn(orderQueries, 'lastOrderNamed')
      .mockRejectedValueOnce(new Error('Synthetic detail failure'))
      .mockResolvedValue(previous);
    await act(async () => {
      tree = create(<OrderFormScreen />);
      await settle();
    });
    const picked = tree!.root
      .findAllByType(Pressable)
      .find((node) => node.findAllByType(Text).some((text) => text.props.children === previous.name))!;
    await act(async () => {
      picked.props.onPress();
      await settle();
    });
    const detail = tree!.root.findAllByType(ErrorNotice).find((node) => node.props.what === 'دستور قبلی')!;
    expect(detail.props.error).toBeInstanceOf(Error);
    expect(
      tree!.root.findAllByType(ErrorNotice).find((node) => node.props.what === 'پیشنهادهای کاردکس')!.props.error,
    ).toBeUndefined();
    await act(async () => {
      detail.props.onRetry();
      await settle();
    });
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenLastCalledWith(previous.name);
    expect(input('دوز').props.value).toBe('2 g');
    expect(
      tree!.root.findAllByType(ErrorNotice).find((node) => node.props.what === 'دستور قبلی')!.props.error,
    ).toBeUndefined();
  });
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

describe('note route ownership and delayed history confirmations', () => {
  async function history() {
    const id = await createNote({ patientId, type: 'general', body: 'First history text' });
    await updateNote(id, { body: 'Current history text' });
    mockParams.noteId = id;
    await act(async () => {
      tree = create(<NoteHistoryScreen />);
      await settle();
    });
    await act(async () => button('برگرداندن این نسخه').props.onPress());
    const dialog = jest.mocked(Alert.alert).mock.calls.at(-1)!;
    return { id, dialog, confirm: dialog[2]!.find((item) => item.text === 'برگردان')!.onPress! };
  }

  it.each(['note', 'patient'] as const)('retains typed note input when the %s is deleted', async (kind) => {
    const noteId = await createNote({ patientId, type: 'general', body: 'Original note' });
    mockParams.noteId = noteId;
    await act(async () => {
      tree = create(<NoteEditorScreen />);
      await settle();
    });
    await act(async () => input('متن نوت').props.onChangeText('Only local copy'));
    const save = button('ثبت در پرونده').props.onPress;
    if (kind === 'note') t.db.update(notes).set(softDelete()).where(eq(notes.id, noteId)).run();
    else t.db.update(patients).set(softDelete()).where(eq(patients.id, patientId)).run();
    const before = t.db.select().from(notes).all();
    await act(async () => {
      tree!.update(<NoteEditorScreen />);
      await settle();
      save();
      await settle();
    });
    expect(input('متن نوت').props.value).toBe('Only local copy');
    expect(button('ثبت در پرونده').props.disabled).toBe(true);
    expect(t.db.select().from(notes).all()).toEqual(before);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('retains a new-note editor when its patient is deleted after typing', async () => {
    await act(async () => {
      tree = create(<NoteEditorScreen />);
      await settle();
    });
    await act(async () => input('Subjective').props.onChangeText('Only new-note copy'));
    t.db.update(patients).set(softDelete()).where(eq(patients.id, patientId)).run();
    await act(async () => {
      tree!.update(<NoteEditorScreen />);
      await settle();
    });
    expect(input('Subjective').props.value).toBe('Only new-note copy');
    expect(button('ثبت در پرونده').props.disabled).toBe(true);
  });

  it.each(['unmount', 'focus', 'route'] as const)(
    'a delayed history confirmation refuses after %s changes',
    async (kind) => {
      const { id, confirm } = await history();
      if (kind === 'focus') mockFocused = false;
      await act(async () => {
        if (kind === 'unmount') {
          tree!.unmount();
          tree = undefined;
        }
        if (kind === 'route') {
          mockParams = { id: 'other-route' };
          tree!.update(<NoteHistoryScreen />);
        }
        await settle();
      });
      await act(async () => {
        confirm();
        await settle();
      });
      expect(t.db.select().from(notes).where(eq(notes.id, id)).get()!.body).toBe('Current history text');
      expect(mockDismissTo).not.toHaveBeenCalled();
    },
  );

  it('a repeated confirmation writes once and dismisses to the original patient after success', async () => {
    const { id, confirm } = await history();
    const actual = noteQueries.restoreNoteVersion;
    let acknowledge!: () => void;
    const pending = new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    const write = jest.spyOn(noteQueries, 'restoreNoteVersion').mockImplementation(async (...args) => {
      await actual(...args);
      await pending;
    });
    await act(async () => {
      confirm();
      confirm();
      await settle();
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(t.db.select().from(notes).where(eq(notes.id, id)).get()!.body).toBe('First history text');
    expect(mockDismissTo).not.toHaveBeenCalled();
    await act(async () => {
      acknowledge();
      await settle();
    });
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
    expect(mockDismissTo).toHaveBeenCalledWith({ pathname: '/patient/[id]', params: { id: patientId } });
  });

  it('a successful late restore does not dismiss a newer focused screen', async () => {
    const { id, confirm } = await history();
    const actual = noteQueries.restoreNoteVersion;
    let acknowledge!: () => void;
    const pending = new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    jest.spyOn(noteQueries, 'restoreNoteVersion').mockImplementation(async (...args) => {
      await actual(...args);
      await pending;
    });
    await act(async () => {
      confirm();
      await settle();
      mockFocused = false;
      acknowledge();
      await settle();
    });
    expect(t.db.select().from(notes).where(eq(notes.id, id)).get()!.body).toBe('First history text');
    expect(mockDismissTo).not.toHaveBeenCalled();
  });
  it('a foreign note route cannot seed editable fields', async () => {
    const other = await createPatient({ firstName: 'Synthetic', lastName: 'Other chart' });
    mockParams.noteId = await createNote({ patientId: other, type: 'general', body: 'Other chart text' });
    await act(async () => {
      tree = create(<NoteEditorScreen />);
      await settle();
    });
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(1);
  });

  it('route reuse preserves original typed input instead of remounting under another patient', async () => {
    mockParams.noteId = await createNote({ patientId, type: 'general', body: 'Original note' });
    await act(async () => {
      tree = create(<NoteEditorScreen />);
      await settle();
    });
    await act(async () => input('متن نوت').props.onChangeText('Only mounted original words'));
    mockParams = { id: await createPatient({ firstName: 'Synthetic', lastName: 'Reused route' }) };
    await act(async () => {
      tree!.update(<NoteEditorScreen />);
      await settle();
    });
    expect(input('متن نوت').props.value).toBe('Only mounted original words');
    expect(button('ثبت در پرونده').props.disabled).toBe(true);
  });

  it('a history confirmation cannot restore into a same-ID replacement database', async () => {
    const noteId = await createNote({ patientId, type: 'general', body: 'First version' });
    await updateNote(noteId, { body: 'Restored current version' });
    snapshot();
    await updateNote(noteId, { body: 'Current before replacement' });
    mockParams.noteId = noteId;
    await act(async () => {
      tree = create(<NoteHistoryScreen />);
      await settle();
    });
    await act(async () => {
      tree!.root
        .findAllByType(Button)
        .filter((node) => node.props.label === 'برگرداندن این نسخه')
        .at(-1)!
        .props.onPress();
    });
    const confirm = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((item) => item.text === 'برگردان')!.onPress!;
    await act(async () => {
      replace();
      await settle();
      confirm();
      await settle();
    });
    expect(t.db.select().from(notes).where(eq(notes.id, noteId)).get()!.body).toBe('Restored current version');
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();
  });
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
