import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { Alert, AppState, Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { PickerModal } from '@/components/picker-modal';
import { QuickDateField } from '@/components/quick-date-field';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Input, SelectField, Text } from '@/components/ui';
import { useSaveBeforeLeave } from '@/components/use-save-before-leave';
import { restoreDatabase } from '@/db/client';
import { doctors, ideas, specialties, topics, workspaceFormDrafts } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { createDoctor } from '@/features/doctors/queries';
import * as formQueries from '@/features/workspace-forms/queries';
import { UnfinishedWorkspaceForms } from '@/features/workspace-forms/unfinished-forms';
import { datasetGeneration, reserveDatasetReplacement } from '@/lib/dataset-write';
import { softDelete, stamps } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { ideaFormCodec } from './form-draft';
import { ideaFormPort, ideaFormQuery } from './form-draft-queries';
import { IdeaFormScreen } from './idea-form-screen';
import { createIdea } from './ideas-queries';
import { createTopic } from './queries';
import { TopicFormScreen } from './topic-form-screen';

let mockParams: { ideaId?: string; topicId?: string; draftId?: string } = {};
let mockReadError: Error | undefined;
let mockFocused = true;
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack }),
}));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({ isFocused: () => mockFocused }) }));
jest.mock('react-native', () => {
  const native = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy(native, { get: (target, key) => (key === 'Pressable' ? 'Pressable' : Reflect.get(target, key)) });
});
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[] }) => ({
    data: mockReadError ? undefined : query.all(),
    error: mockReadError,
    retry: jest.fn(),
  }),
}));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: jest.fn() }));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/quick-date-field', () => ({ QuickDateField: 'QuickDateField' }));
jest.mock('@/components/picker-modal', () => ({ PickerModal: 'PickerModal' }));
jest.mock('@/components/collapsible-section', () => ({
  CollapsibleSection: ({ children }: { children: import('react').ReactNode }) => children,
}));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Input: 'Input',
  Column: 'Column',
  Row: 'Row',
  Card: 'Card',
  Text: 'Text',
  Screen: 'Screen',
  ChipSelect: 'ChipSelect',
  SectionHeader: 'SectionHeader',
  SelectField: 'SelectField',
  Toggle: 'Toggle',
  EmptyState: 'EmptyState',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, radii: {}, spacing: {} }) }));

let tree: ReactTestRenderer | undefined;
let t: TestDatabase;
let background: ((state: import('react-native').AppStateStatus) => void) | undefined;
let snapshotNumber = 0;
const input = (label: string) => tree!.root.findAllByType(Input).find((node) => node.props.label === label)!;
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
async function settle() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
async function press(label: string) {
  await act(async () => {
    button(label).props.onPress();
    await settle();
  });
}

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  mockParams = {};
  mockFocused = true;
  mockReadError = undefined;
  mockBack.mockClear();
  mockBack.mockReset();
  jest.mocked(alertError).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    background = listener;
    return { remove: jest.fn() };
  });
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-02T10:00:00Z'));
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  tree = undefined;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('workspace form recovery through the existing routes', () => {
  it('shows archived historical references without offering them as picker choices or blocking a body edit', async () => {
    const teacher = await createDoctor({ firstName: 'Historical', lastName: 'Teacher' });
    t.db
      .insert(specialties)
      .values({ id: 'historical-specialty', ...stamps(), nameFa: 'Historical specialty' })
      .run();
    const id = await createTopic({
      title: 'Historical topic',
      taughtById: teacher,
      specialtyId: 'historical-specialty',
      taughtAt: new Date(),
    });
    t.db.update(doctors).set(softDelete()).where(eq(doctors.id, teacher)).run();
    t.db.update(specialties).set(softDelete()).where(eq(specialties.id, 'historical-specialty')).run();
    mockParams = { topicId: id };
    await act(async () => {
      tree = create(<TopicFormScreen />);
      await settle();
    });
    const selected = tree!.root.findAllByType(SelectField);
    expect(selected.find((node) => node.props.label === 'استاد')?.props.value).toBe('Historical Teacher (بایگانی‌شده)');
    expect(selected.find((node) => node.props.label === 'تخصص')?.props.value).toBe(
      'Historical specialty (بایگانی‌شده)',
    );
    const pickers = tree!.root.findAllByType(PickerModal);
    expect(
      pickers.every((node) =>
        node.props.items.every((item: { id: string }) => item.id !== teacher && item.id !== 'historical-specialty'),
      ),
    ).toBe(true);
    await act(async () => {
      input('متن').props.onChangeText('Updated retained teaching');
    });
    await press('ذخیره');
    expect(t.db.select().from(topics).get()).toMatchObject({
      body: 'Updated retained teaching',
      taughtById: teacher,
      specialtyId: 'historical-specialty',
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(alertError).not.toHaveBeenCalled();
  });
  it.each([
    { kind: 'idea', Form: IdeaFormScreen, label: 'توضیح' },
    { kind: 'topic', Form: TopicFormScreen, label: 'متن' },
  ])('recovers exact unfinished $kind words after remount without pressing Save', async ({ Form, label }) => {
    await act(async () => {
      tree = create(<Form />);
      await settle();
    });
    const words = '  unfinished\n\nwords and trailing spaces  ';
    await act(async () => {
      input(label).props.onChangeText(words);
      jest.advanceTimersByTime(3200);
      await settle();
    });
    const acknowledged = t.db.select().from(workspaceFormDrafts).get()!;
    expect(acknowledged).toBeDefined();
    expect(JSON.parse(acknowledged.body).fields.body).toBe(words);
    expect(t.db.select().from(ideas).all()).toEqual([]);
    expect(t.db.select().from(topics).all()).toEqual([]);
    await act(async () => {
      tree!.unmount();
      await settle();
    });
    await act(async () => {
      tree = create(<Form />);
      await settle();
    });
    expect(input(label).props.value).toBe(words);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('does not pop a newer route when publication acknowledges after focus was lost', async () => {
    await act(async () => {
      tree = create(<IdeaFormScreen />);
      await settle();
    });
    await act(async () => {
      input('عنوان').props.onChangeText('Synthetic idea');
    });
    await act(async () => {
      button('ثبت ایده').props.onPress();
      mockFocused = false;
      await settle();
    });
    expect(mockBack).not.toHaveBeenCalled();
    expect(t.db.select().from(ideas).all()).toHaveLength(1);
    expect(input('عنوان').props.editable).toBe(false);
    await act(async () => {
      mockFocused = true;
      button('بستن').props.onPress();
      await settle();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(t.db.select().from(ideas).all()).toHaveLength(1);
  });

  it('flushes background input without publishing or waiting for the timer', async () => {
    await act(async () => {
      tree = create(<IdeaFormScreen />);
      await settle();
    });
    await act(async () => {
      input('توضیح').props.onChangeText('Background raw');
      background!('background');
      await settle();
    });
    expect(ideaFormCodec.decode(t.db.select().from(workspaceFormDrafts).get()!.body).fields.body).toBe(
      'Background raw',
    );
    expect(t.db.select().from(ideas).all()).toEqual([]);
  });
  it('retains a failed autosave, exposes retry and acknowledges only a successful database write', async () => {
    t.sqlite.exec(
      "CREATE TRIGGER fail_raw BEFORE INSERT ON workspace_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic disk failure'); END",
    );
    await act(async () => {
      tree = create(<IdeaFormScreen />);
      await settle();
    });
    await act(async () => {
      input('توضیح').props.onChangeText('Not yet acknowledged');
      jest.advanceTimersByTime(3200);
      await settle();
    });
    expect(t.db.select().from(workspaceFormDrafts).all()).toEqual([]);
    expect(input('توضیح').props.value).toBe('Not yet acknowledged');
    t.sqlite.exec('DROP TRIGGER fail_raw');
    await act(async () => {
      button('تلاش دوباره').props.onPress();
      await settle();
    });
    expect(ideaFormCodec.decode(t.db.select().from(workspaceFormDrafts).get()!.body).fields.body).toBe(
      'Not yet acknowledged',
    );
    expect(tree!.root.findAllByType(Button).some((node) => node.props.label === 'تلاش دوباره')).toBe(false);
  });
  it('keeps a loaded form and its original words on a refresh error, then resumes the same editor', async () => {
    const id = await createIdea({ title: 'Original title' });
    mockParams = { ideaId: id };
    await act(async () => {
      tree = create(<IdeaFormScreen />);
      await settle();
    });
    await act(async () => {
      input('توضیح').props.onChangeText('Retained during read error');
    });
    await act(async () => {
      mockReadError = new Error('Synthetic read failure');
      tree!.update(<IdeaFormScreen />);
      await settle();
    });
    expect(input('توضیح').props.value).toBe('Retained during read error');
    expect(input('توضیح').props.editable).toBe(false);
    await act(async () => {
      mockReadError = undefined;
      tree!.update(<IdeaFormScreen />);
      await settle();
    });
    expect(input('توضیح').props.value).toBe('Retained during read error');
    expect(input('توضیح').props.editable).toBe(true);
  });
  it('preserves partial date patches from the latest input and refuses the last valid hidden date', async () => {
    await act(async () => {
      tree = create(<TopicFormScreen />);
      await settle();
    });
    await act(async () => {
      input('عنوان').props.onChangeText('Synthetic invalid date');
      const field = tree!.root.findByType(QuickDateField);
      field.props.onRawInputChange({ customOpen: true });
      field.props.onRawInputChange({ dateText: '1404/10/' });
      field.props.onRawInputChange({ clockText: '2:' });
      button('ثبت مبحث').props.onPress();
      await settle();
    });
    expect(t.db.select().from(topics).all()).toEqual([]);
    expect(JSON.parse(t.db.select().from(workspaceFormDrafts).get()!.body).fields.date).toEqual({
      dateText: '1404/10/',
      clockText: '2:',
      customOpen: true,
    });
    expect(mockBack).not.toHaveBeenCalled();
    await act(async () => {
      tree!.unmount();
      await settle();
      tree = create(<TopicFormScreen />);
      await settle();
    });
    expect(tree!.root.findByType(QuickDateField).props.rawInput).toEqual({
      dateText: '1404/10/',
      clockText: '2:',
      customOpen: true,
    });
  });
  it('compares a changed published basis and keeps local input only after explicit confirmation and separate Save', async () => {
    const id = await createIdea({ title: 'Original', body: 'Published basis' });
    mockParams = { ideaId: id };
    await act(async () => {
      tree = create(<IdeaFormScreen />);
      await settle();
    });
    await act(async () => {
      input('توضیح').props.onChangeText('Local writing');
    });
    t.db.update(ideas).set({ body: 'Newer published basis' }).where(eq(ideas.id, id)).run();
    await act(async () => {
      button('ذخیره').props.onPress();
      await settle();
    });
    expect(mockBack).not.toHaveBeenCalled();
    expect(jest.mocked(alertError)).toHaveBeenCalled();
    await press('مقایسهٔ نسخه‌ها');
    await press('نگه‌داشتن نسخهٔ من');
    const accept = jest.mocked(Alert.alert).mock.calls.at(-1)![2]![1]!.onPress!;
    await act(async () => {
      accept();
      await settle();
    });
    expect(t.db.select().from(ideas).get()!.body).toBe('Newer published basis');
    expect(input('توضیح').props.value).toBe('Local writing');
    await act(async () => {
      button('ذخیره').props.onPress();
      await settle();
    });
    expect(t.db.select().from(ideas).get()!.body).toBe('Local writing');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it.each(['focus', 'route', 'read', 'unmount', 'replacement'])(
    'rejects an old adoption confirmation after %s changes',
    async (reason) => {
      const id = await createIdea({ title: 'Original', body: 'Published basis' });
      mockParams = { ideaId: id };
      await act(async () => {
        tree = create(<IdeaFormScreen />);
        await settle();
      });
      await act(async () => {
        input('توضیح').props.onChangeText('Local writing');
      });
      t.db.update(ideas).set({ body: 'Newer published basis' }).where(eq(ideas.id, id)).run();
      await press('ذخیره');
      await press('مقایسهٔ نسخه‌ها');
      await press('نگه‌داشتن نسخهٔ من');
      const accept = jest.mocked(Alert.alert).mock.calls.at(-1)![2]![1]!.onPress!;
      const rawBefore = t.db.select().from(workspaceFormDrafts).get()!;
      await act(async () => {
        if (reason === 'focus') mockFocused = false;
        if (reason === 'route') {
          mockParams = { ideaId: 'different-intent' };
          tree!.update(<IdeaFormScreen />);
        }
        if (reason === 'read') {
          mockReadError = new Error('Synthetic read failure');
          tree!.update(<IdeaFormScreen />);
        }
        if (reason === 'unmount') {
          tree!.unmount();
          tree = undefined;
        }
        if (reason === 'replacement') {
          const replacement = reserveDatasetReplacement();
          replacement.committed();
          replacement.release();
        }
        await settle();
      });
      await act(async () => {
        accept();
        accept();
        await settle();
      });
      expect(t.db.select().from(workspaceFormDrafts).get()).toEqual(rawBefore);
      expect(t.db.select().from(ideas).get()!.body).toBe('Newer published basis');
      expect(mockBack).not.toHaveBeenCalled();
    },
  );
  it('retains old mounted input across an actual same-ID database restore and fences the old Save handler', async () => {
    const id = await createIdea({ title: 'Original', body: 'Backed-up body' });
    mockParams = { ideaId: id };
    const path = `/workspace-form-${++snapshotNumber}.db`;
    t.sqlite.exec(`VACUUM INTO '${path}'`);
    await act(async () => {
      tree = create(<IdeaFormScreen />);
      await settle();
    });
    await act(async () => {
      input('توضیح').props.onChangeText('Later mounted writing');
      jest.advanceTimersByTime(3200);
      await settle();
    });
    const oldSave = button('ذخیره').props.onPress;
    await act(async () => {
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
      await settle();
      oldSave();
      await settle();
    });
    expect(input('توضیح').props.value).toBe('Later mounted writing');
    expect(input('توضیح').props.editable).toBe(false);
    expect(t.db.select().from(ideas).get()!.body).toBe('Backed-up body');
    expect(t.db.select().from(workspaceFormDrafts).all()).toEqual([]);
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('keeps an unsupported selected document copyable without opening another draft or fresh form', async () => {
    const seed = formQueries.workspaceFormSeed(ideaFormPort, (await ideaFormQuery(null))[0]!, null, new Date());
    await formQueries.saveWorkspaceDraft(ideaFormPort, 'unsupported', seed.document, 0, datasetGeneration());
    const body = JSON.stringify({ ...seed.document, version: 2, futureField: 'Retain synthetic future data' });
    t.db.update(workspaceFormDrafts).set({ body }).where(eq(workspaceFormDrafts.id, 'unsupported')).run();
    mockParams = { draftId: 'unsupported' };
    await act(async () => {
      tree = create(<IdeaFormScreen />);
      await settle();
    });
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    expect(tree!.root.findAllByType(Text).some((node) => node.props.selectable && node.props.children === body)).toBe(
      true,
    );
    expect(t.db.select().from(workspaceFormDrafts).get()!.body).toBe(body);
  });
  it('keeps a missing edit target labeled as the original edit and preserves its readable draft', async () => {
    const id = await createIdea({ title: 'Synthetic original edit' });
    const seed = formQueries.workspaceFormSeed(ideaFormPort, (await ideaFormQuery(id))[0]!, id, new Date());
    seed.document.fields.body = 'Original edit words';
    await formQueries.saveWorkspaceDraft(ideaFormPort, 'missing-edit', seed.document, 0, datasetGeneration());
    t.db.update(ideas).set({ deletedAt: new Date() }).where(eq(ideas.id, id)).run();
    mockParams = { ideaId: id, draftId: 'missing-edit' };
    await act(async () => {
      tree = create(<IdeaFormScreen />);
      await settle();
    });
    expect(tree!.root.findByType(ScreenOptions).props.options.title).toBe('ویرایش ایده');
    expect(input('توضیح').props.value).toBe('Original edit words');
    expect(input('توضیح').props.editable).toBe(false);
    expect(button('ذخیره').props.disabled).toBe(true);
    expect(t.db.select().from(workspaceFormDrafts).get()!.deletedAt).toBeNull();
  });
  it('refuses loading a foreign document from an imported row without replacing local words', async () => {
    const id = await createIdea({ title: 'Synthetic original' });
    mockParams = { ideaId: id };
    await act(async () => {
      tree = create(<IdeaFormScreen />);
      await settle();
    });
    await act(async () => {
      input('توضیح').props.onChangeText('Keep local words');
      jest.advanceTimersByTime(3200);
      await settle();
    });
    const raw = t.db.select().from(workspaceFormDrafts).get()!;
    const original = ideaFormCodec.decode(raw.body);
    const foreign = ideaFormCodec.create({
      recordId: 'foreign-target',
      basis: original.basis,
      fields: { ...original.fields, body: 'Foreign imported words' },
    });
    const body = ideaFormCodec.encode(foreign);
    t.db.update(workspaceFormDrafts).set({ body }).where(eq(workspaceFormDrafts.id, raw.id)).run();
    await press('ذخیره');
    await press('مقایسهٔ نسخه‌ها');
    await press('بارگذاری پیش‌نویس ذخیره‌شده');
    const accept = jest.mocked(Alert.alert).mock.calls.at(-1)![2]![1]!.onPress!;
    await act(async () => {
      accept();
      await settle();
    });
    expect(input('توضیح').props.value).toBe('Keep local words');
    expect(t.db.select().from(workspaceFormDrafts).get()!.body).toBe(body);
    expect(t.db.select().from(ideas).get()!.body).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('releases the submission guard before requesting normal route removal', async () => {
    let exitCheck: Promise<boolean> | undefined;
    mockBack.mockImplementation(() => {
      exitCheck = jest.mocked(useSaveBeforeLeave).mock.calls.at(-1)![0]();
    });
    await act(async () => {
      tree = create(<IdeaFormScreen />);
      await settle();
    });
    await act(async () => {
      input('عنوان').props.onChangeText('Synthetic publication');
      button('ثبت ایده').props.onPress();
      await settle();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
    await expect(exitCheck).resolves.toBe(true);
    expect(t.db.select().from(ideas).all()).toHaveLength(1);
  });
  it('pages tied recovery links three at a time and opens the exact selected draft', async () => {
    const onOpen = jest.fn();
    for (let i = 0; i < 7; i++) {
      const id = await createIdea({ title: `Synthetic published ${i}` });
      const document = formQueries.workspaceFormSeed(
        ideaFormPort,
        (await ideaFormQuery(id))[0]!,
        id,
        new Date(),
      ).document;
      document.fields.title = `Raw ${i}`;
      await formQueries.saveWorkspaceDraft(ideaFormPort, `raw-${i}`, document, 0, datasetGeneration());
    }
    t.db
      .update(workspaceFormDrafts)
      .set({ updatedAt: new Date('2026-01-01T10:00:00Z') })
      .run();
    await act(async () => {
      tree = create(<UnfinishedWorkspaceForms kind="idea" onOpen={onOpen} />);
      await settle();
    });
    expect(tree!.root.findAllByType(Pressable)).toHaveLength(3);
    await press('قدیمی‌تر');
    await press('قدیمی‌تر');
    expect(tree!.root.findAllByType(Pressable)).toHaveLength(1);
    tree!.root.findByType(Pressable).props.onPress();
    expect(onOpen.mock.calls[0]![1]).toBe('raw-0');
    await press('جدیدتر');
    await press('جدیدتر');
    expect(tree!.root.findAllByType(Pressable)).toHaveLength(3);
  });
  it('does not fall back to another active draft when the selected one was retired', async () => {
    const seed = formQueries.workspaceFormSeed(ideaFormPort, (await ideaFormQuery(null))[0]!, null, new Date());
    seed.document.fields.body = 'Selected earlier raw';
    await formQueries.saveWorkspaceDraft(ideaFormPort, 'earlier', seed.document, 0, datasetGeneration());
    await formQueries.discardWorkspaceDraft('idea', 'earlier', null, 1, new Date(), datasetGeneration());
    const next = { ...seed.document, fields: { ...seed.document.fields, body: 'Different active raw' } };
    await formQueries.saveWorkspaceDraft(ideaFormPort, 'later', next, 0, datasetGeneration());
    mockParams = { draftId: 'earlier' };
    await act(async () => {
      tree = create(<IdeaFormScreen />);
      await settle();
    });
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    expect(t.db.select().from(workspaceFormDrafts).where(eq(workspaceFormDrafts.id, 'later')).get()!.body).toBe(
      ideaFormCodec.encode(next),
    );
  });
});
