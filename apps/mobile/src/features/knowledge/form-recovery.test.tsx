import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { Alert, AppState, Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { PickerModal } from '@/components/picker-modal';
import { QuickDateField } from '@/components/quick-date-field';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Column, Input, Screen, SelectField, Text } from '@/components/ui';
import { useSaveBeforeLeave } from '@/components/use-save-before-leave';
import { restoreDatabase } from '@/db/client';
import {
  doctors,
  ideas,
  prescriptionTemplates,
  specialties,
  specialtyProfiles,
  topics,
  workspaceFormDrafts,
} from '@/db/schema';
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
import { PrescriptionFormScreen } from './prescription-form-screen';
import { createPrescription } from './prescriptions-queries';
import { createTopic } from './queries';
import { SpecialtyFormScreen } from './specialty-form-screen';
import { createSpecialtyProfile } from './specialty-profiles-queries';
import { TopicFormScreen } from './topic-form-screen';

let mockParams: { ideaId?: string; topicId?: string; profileId?: string; templateId?: string; draftId?: string } = {};
let mockReadError: Error | undefined;
let mockHoldGateContent = false;
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
jest.mock('@/features/workspace-forms/form-gate', () => {
  const actual = jest.requireActual<typeof import('@/features/workspace-forms/form-gate')>(
    '@/features/workspace-forms/form-gate',
  );
  return {
    ...actual,
    WorkspaceFormGate: (props: import('react').ComponentProps<typeof actual.WorkspaceFormGate>) => (
      <actual.WorkspaceFormGate {...props}>
        {(...args) => (mockHoldGateContent ? null : props.children(...args))}
      </actual.WorkspaceFormGate>
    ),
  };
});
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
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');
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
  mockHoldGateContent = false;
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

const notebookCases = [
  {
    kind: 'specialty-profile',
    Form: SpecialtyFormScreen,
    label: 'در یک نگاه',
    field: 'overview',
    createLabel: 'ثبت رشته',
  },
  {
    kind: 'prescription',
    Form: PrescriptionFormScreen,
    label: 'توصیه‌ها',
    field: 'adviceText',
    createLabel: 'ثبت نسخه',
  },
] as const;
function fillNotebookRequired(kind: (typeof notebookCases)[number]['kind']) {
  if (kind === 'specialty-profile') input('یا نام دلخواه').props.onChangeText('Synthetic research');
  else {
    input('عنوان').props.onChangeText('Synthetic prescription');
    input('دارو').props.onChangeText('Synthetic drug');
  }
}

describe('remaining knowledge forms reuse the original workspace lifecycle', () => {
  it.each(notebookCases)(
    'recovers exact unfinished $kind input after remount without publication',
    async ({ kind, Form, label, field }) => {
      await act(async () => {
        tree = create(<Form />);
        await settle();
      });
      const words = '  unfinished\n\nknowledge words  ';
      await act(async () => {
        input(label).props.onChangeText(words);
        jest.advanceTimersByTime(3200);
        await settle();
      });
      const acknowledged = t.db.select().from(workspaceFormDrafts).get()!;
      expect(acknowledged.kind).toBe(kind);
      expect(JSON.parse(acknowledged.body).fields[field]).toBe(words);
      expect(t.db.select().from(specialtyProfiles).all()).toEqual([]);
      expect(t.db.select().from(prescriptionTemplates).all()).toEqual([]);
      await act(async () => {
        tree!.unmount();
        await settle();
        tree = create(<Form />);
        await settle();
      });
      expect(input(label).props.value).toBe(words);
      expect(mockBack).not.toHaveBeenCalled();
    },
  );
  it('retains partial prescription rows and their stable keys after deleting another line and recovering', async () => {
    await act(async () => {
      tree = create(<PrescriptionFormScreen />);
      await settle();
    });
    await press('قلم بعدی');
    await act(async () => {
      const doses = tree!.root.findAllByType(Input).filter((node) => node.props.label === 'دوز');
      doses[0]!.props.onChangeText(' first dose ');
      doses[1]!.props.onChangeText(' 12,5 mg ');
      tree!.root
        .findAllByType(Input)
        .filter((node) => node.props.label === 'یا خط را خودتان بنویسید')[1]!
        .props.onChangeText('  incomplete SIG  ');
    });
    const secondDose = tree!.root.findAllByType(Input).filter((node) => node.props.label === 'دوز')[1]!;
    const heldDoseCallback = secondDose.props.onChangeText;
    await act(async () => {
      tree!.root
        .findAllByType(Pressable)
        .find((node) => node.props.accessibilityLabel === 'حذف قلم ۱')!
        .props.onPress();
      heldDoseCallback('  retained second dose  ');
      background!('background');
      await settle();
    });
    expect(input('دوز')).toBe(secondDose);
    const lines = JSON.parse(t.db.select().from(workspaceFormDrafts).get()!.body).fields.items;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ drug: '', dose: '  retained second dose  ', sig: '  incomplete SIG  ' });
    expect(t.db.select().from(prescriptionTemplates).all()).toEqual([]);
    await act(async () => {
      tree!.unmount();
      await settle();
      tree = create(<PrescriptionFormScreen />);
      await settle();
    });
    expect(input('دوز').props.value).toBe('  retained second dose  ');
    expect(input('یا خط را خودتان بنویسید').props.value).toBe('  incomplete SIG  ');
    await act(async () => {
      input('توضیح این قلم').props.onChangeText(' raw notes ');
      background!('background');
      await settle();
    });
    expect(JSON.parse(t.db.select().from(workspaceFormDrafts).get()!.body).fields.items[0].key).toBe(lines[0].key);
  });
  it('refuses explicit prescription publication while another line contains an unnamed dose', async () => {
    await act(async () => {
      tree = create(<PrescriptionFormScreen />);
      await settle();
    });
    await act(async () => {
      fillNotebookRequired('prescription');
    });
    await press('قلم بعدی');
    await act(async () => {
      tree!.root
        .findAllByType(Input)
        .filter((node) => node.props.label === 'دوز')[1]!
        .props.onChangeText(' 500 mg ');
      button('ثبت نسخه').props.onPress();
      await settle();
    });
    expect(t.db.select().from(prescriptionTemplates).all()).toEqual([]);
    expect(JSON.parse(t.db.select().from(workspaceFormDrafts).get()!.body).fields.items[1].dose).toBe(' 500 mg ');
    expect(mockBack).not.toHaveBeenCalled();
    expect(alertError).toHaveBeenCalled();
  });
  it.each(notebookCases)(
    'flushes $kind through background and Close without publication',
    async ({ Form, label, field }) => {
      await act(async () => {
        tree = create(<Form />);
        await settle();
      });
      await act(async () => {
        input(label).props.onChangeText('Background raw');
        background!('background');
        await settle();
      });
      expect(JSON.parse(t.db.select().from(workspaceFormDrafts).get()!.body).fields[field]).toBe('Background raw');
      await act(async () => {
        input(label).props.onChangeText('Close raw');
        button('بستن').props.onPress();
        await settle();
      });
      expect(JSON.parse(t.db.select().from(workspaceFormDrafts).get()!.body).fields[field]).toBe('Close raw');
      expect(t.db.select().from(specialtyProfiles).all()).toEqual([]);
      expect(t.db.select().from(prescriptionTemplates).all()).toEqual([]);
      expect(mockBack).toHaveBeenCalledTimes(1);
    },
  );
  it.each(notebookCases)(
    'retains failed $kind raw input and acknowledges only after Retry',
    async ({ Form, label, field }) => {
      t.sqlite.exec(
        "CREATE TRIGGER fail_raw BEFORE INSERT ON workspace_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic disk failure'); END",
      );
      await act(async () => {
        tree = create(<Form />);
        await settle();
      });
      await act(async () => {
        input(label).props.onChangeText('Unacknowledged words');
        jest.advanceTimersByTime(3200);
        await settle();
      });
      expect(t.db.select().from(workspaceFormDrafts).all()).toEqual([]);
      expect(input(label).props.value).toBe('Unacknowledged words');
      t.sqlite.exec('DROP TRIGGER fail_raw');
      await press('تلاش دوباره');
      expect(JSON.parse(t.db.select().from(workspaceFormDrafts).get()!.body).fields[field]).toBe(
        'Unacknowledged words',
      );
    },
  );
  it.each(notebookCases)(
    'retains $kind native parents and does not close a newer route after late publication',
    async ({ kind, Form, label, createLabel }) => {
      await act(async () => {
        tree = create(<Form />);
        await settle();
      });
      const screen = tree!.root.findByType(Screen);
      const header = tree!.root.findByType(ScreenOptions);
      const parent = tree!.root.findAllByType(Column).find((node) => node.props.collapsable === false)!;
      await act(async () => {
        fillNotebookRequired(kind);
      });
      await act(async () => {
        button(createLabel).props.onPress();
        input(label).props.onChangeText('Too late');
        mockFocused = false;
        await settle();
      });
      expect(mockBack).not.toHaveBeenCalled();
      expect(input(label).props.value).not.toBe('Too late');
      expect(input(label).props.editable).toBe(false);
      expect(tree!.root.findByType(SelectField).props.disabled).toBe(true);
      expect(tree!.root.findByType(Screen)).toBe(screen);
      expect(tree!.root.findByType(ScreenOptions)).toBe(header);
      expect(tree!.root.findAllByType(Column).find((node) => node.props.collapsable === false)).toBe(parent);
      expect(
        t.db
          .select()
          .from(kind === 'specialty-profile' ? specialtyProfiles : prescriptionTemplates)
          .all(),
      ).toHaveLength(1);
      await act(async () => {
        mockFocused = true;
        button('بستن').props.onPress();
        await settle();
      });
      expect(mockBack).toHaveBeenCalledTimes(1);
    },
  );
  it.each(notebookCases)(
    'shows an original archived specialty for $kind without offering it in the picker',
    async ({ kind, Form, label }) => {
      t.db
        .insert(specialties)
        .values({ id: 'historical-reference', ...stamps(), nameFa: 'Historical specialty' })
        .run();
      const id =
        kind === 'specialty-profile'
          ? await createSpecialtyProfile({ specialtyId: 'historical-reference' })
          : await createPrescription({
              title: 'Synthetic',
              specialtyId: 'historical-reference',
              items: [{ drug: 'Synthetic' }],
            });
      mockParams = kind === 'specialty-profile' ? { profileId: id } : { templateId: id };
      t.db.update(specialties).set(softDelete()).where(eq(specialties.id, 'historical-reference')).run();
      await act(async () => {
        tree = create(<Form />);
        await settle();
      });
      expect(tree!.root.findByType(SelectField).props.value).toBe('Historical specialty (بایگانی‌شده)');
      expect(
        tree!.root
          .findByType(PickerModal)
          .props.items.some((item: { id: string }) => item.id === 'historical-reference'),
      ).toBe(false);
      await act(async () => {
        input(label).props.onChangeText('Edited historical words');
      });
      await press('ذخیره');
      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(alertError).not.toHaveBeenCalled();
    },
  );
  it.each(notebookCases)(
    'does not initialize a late $kind child with a replacement specialty label',
    async ({ kind, Form, label }) => {
      t.db
        .insert(specialties)
        .values({ id: 'late-specialty', ...stamps(), nameFa: 'Original late specialty' })
        .run();
      const id =
        kind === 'specialty-profile'
          ? await createSpecialtyProfile({ specialtyId: 'late-specialty', overview: 'Original late words' })
          : await createPrescription({
              title: 'Original late prescription',
              specialtyId: 'late-specialty',
              items: [{ drug: 'Synthetic' }],
              adviceText: 'Original late words',
            });
      mockParams = kind === 'specialty-profile' ? { profileId: id } : { templateId: id };
      mockHoldGateContent = true;
      await act(async () => {
        tree = create(<Form />);
        await settle();
      });
      expect(tree!.root.findAllByType(Input)).toHaveLength(0);
      await act(async () => {
        const replacement = reserveDatasetReplacement();
        try {
          restoreDatabase(replacement)
            .db.update(specialties)
            .set({ nameFa: 'Replacement late specialty' })
            .where(eq(specialties.id, 'late-specialty'))
            .run();
          replacement.committed();
        } finally {
          replacement.release();
        }
        mockHoldGateContent = false;
        tree!.update(<Form />);
        await settle();
      });
      expect(input(label).props.value).toBe('Original late words');
      expect(input(label).props.editable).toBe(false);
      expect(tree!.root.findByType(SelectField).props.value).not.toBe('Replacement late specialty');
      expect(tree!.root.findByType(PickerModal).props.items).toEqual([]);
      expect(t.db.select().from(workspaceFormDrafts).all()).toEqual([]);
    },
  );
  it.each(notebookCases)(
    'retains $kind input and owned specialty labels across same-key dataset replacement',
    async ({ kind, Form, label }) => {
      t.db
        .insert(specialties)
        .values({ id: 'same-key', ...stamps(), nameFa: 'Original specialty' })
        .run();
      const id =
        kind === 'specialty-profile'
          ? await createSpecialtyProfile({ specialtyId: 'same-key' })
          : await createPrescription({ title: 'Synthetic', specialtyId: 'same-key', items: [{ drug: 'Synthetic' }] });
      mockParams = kind === 'specialty-profile' ? { profileId: id } : { templateId: id };
      await act(async () => {
        tree = create(<Form />);
        await settle();
      });
      await act(async () => {
        input(label).props.onChangeText('Original raw input');
        background!('background');
        await settle();
      });
      const oldSave = button('ذخیره').props.onPress;
      const oldChange = input(label).props.onChangeText;
      const oldSelect = tree!.root.findByType(PickerModal).props.onSelect;
      const before = t.db.select().from(workspaceFormDrafts).get()!;
      await act(async () => {
        const replacement = reserveDatasetReplacement();
        const trusted = restoreDatabase(replacement);
        trusted.db
          .update(specialties)
          .set({ nameFa: 'Replacement specialty' })
          .where(eq(specialties.id, 'same-key'))
          .run();
        replacement.committed();
        replacement.release();
        tree!.update(<Form />);
        await settle();
        oldChange('Old callback replacement');
        oldSelect({ id: 'same-key' });
        oldSave();
        await settle();
      });
      expect(input(label).props.value).toBe('Original raw input');
      expect(input(label).props.editable).toBe(false);
      expect(tree!.root.findByType(SelectField).props.value).toBe('Original specialty');
      expect(tree!.root.findByType(SelectField).props.disabled).toBe(true);
      expect(tree!.root.findByType(PickerModal).props.items).toEqual([]);
      expect(t.db.select().from(workspaceFormDrafts).get()).toEqual(before);
      expect(mockBack).not.toHaveBeenCalled();
    },
  );
  it.each(notebookCases)(
    'keeps loaded $kind input through refresh errors and route reuse',
    async ({ kind, Form, label }) => {
      const id =
        kind === 'specialty-profile'
          ? await createSpecialtyProfile({ nameText: 'Original specialty' })
          : await createPrescription({ title: 'Original prescription', items: [{ drug: 'Synthetic' }] });
      mockParams = kind === 'specialty-profile' ? { profileId: id } : { templateId: id };
      await act(async () => {
        tree = create(<Form />);
        await settle();
      });
      await act(async () => {
        input(label).props.onChangeText('Retained raw words');
      });
      await act(async () => {
        mockReadError = new Error('Synthetic refresh failure');
        tree!.update(<Form />);
        await settle();
      });
      expect(input(label).props.value).toBe('Retained raw words');
      expect(input(label).props.editable).toBe(false);
      expect(tree!.root.findByType(SelectField).props.disabled).toBe(true);
      await act(async () => {
        mockReadError = undefined;
        tree!.update(<Form />);
        await settle();
      });
      expect(input(label).props.editable).toBe(true);
      expect(tree!.root.findByType(SelectField).props.disabled).toBe(false);
      await act(async () => {
        mockParams =
          kind === 'specialty-profile' ? { profileId: 'different-intent' } : { templateId: 'different-intent' };
        tree!.update(<Form />);
        await settle();
      });
      expect(input(label).props.value).toBe('Retained raw words');
      expect(input(label).props.editable).toBe(false);
      expect(button('ذخیره').props.disabled).toBe(true);
      expect(tree!.root.findByType(SelectField).props.disabled).toBe(true);
    },
  );
  it('requires explicit prescription conflict adoption before separate publication', async () => {
    const id = await createPrescription({
      title: 'Original',
      items: [{ drug: 'Synthetic' }],
      adviceText: 'Published advice',
    });
    mockParams = { templateId: id };
    await act(async () => {
      tree = create(<PrescriptionFormScreen />);
      await settle();
    });
    await act(async () => {
      input('توصیه‌ها').props.onChangeText('Local advice');
    });
    t.db
      .update(prescriptionTemplates)
      .set({ adviceText: 'Changed advice', usageCount: 2 })
      .where(eq(prescriptionTemplates.id, id))
      .run();
    await press('ذخیره');
    expect(mockBack).not.toHaveBeenCalled();
    await press('مقایسهٔ نسخه‌ها');
    await press('نگه‌داشتن نسخهٔ من');
    const accept = jest.mocked(Alert.alert).mock.calls.at(-1)![2]![1]!.onPress!;
    await act(async () => {
      accept();
      await settle();
    });
    expect(t.db.select().from(prescriptionTemplates).get()!.adviceText).toBe('Changed advice');
    expect(input('توصیه‌ها').props.value).toBe('Local advice');
    await press('ذخیره');
    expect(t.db.select().from(prescriptionTemplates).get()!).toMatchObject({
      adviceText: 'Local advice',
      usageCount: 2,
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
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
