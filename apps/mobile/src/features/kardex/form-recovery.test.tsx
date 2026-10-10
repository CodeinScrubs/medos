import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { Alert, AppState, Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, Input, Text } from '@/components/ui';
import { useSaveBeforeLeave } from '@/components/use-save-before-leave';
import { orders, patients, workspaceFormDrafts } from '@/db/schema';
import { openEncounter } from '@/features/encounters/queries';
import { createPatient } from '@/features/patients/queries';
import * as formQueries from '@/features/workspace-forms/queries';
import { UnfinishedWorkspaceForms } from '@/features/workspace-forms/unfinished-forms';
import { datasetGeneration, reserveDatasetReplacement } from '@/lib/dataset-write';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { orderFormCodec } from './form-draft';
import { orderDraftsQuery, orderFormPort } from './form-draft-queries';
import { OrderFormScreen } from './order-form-screen';
import { createOrder } from './queries';

let mockParams: { id: string; orderId?: string; draftId?: string };
let mockReadError: Error | undefined;
let mockFocused = true;
let mockDelayOrderChild = false;
const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ back: mockBack }) }));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({ isFocused: () => mockFocused }) }));
jest.mock('react-native', () => {
  const native = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy(native, { get: (target, key) => (key === 'Pressable' ? 'Pressable' : Reflect.get(target, key)) });
});
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/features/workspace-forms/form-gate', () => {
  const real = jest.requireActual<typeof import('@/features/workspace-forms/form-gate')>(
    '@/features/workspace-forms/form-gate',
  );
  return {
    ...real,
    WorkspaceFormGate: function DelayedFormGate(props: Parameters<typeof real.WorkspaceFormGate>[0]) {
      return (
        <real.WorkspaceFormGate {...props}>
          {(...args) => (mockDelayOrderChild ? null : props.children(...args))}
        </real.WorkspaceFormGate>
      );
    },
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
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/quick-date-field', () => ({ QuickDateField: 'QuickDateField' }));
jest.mock('@/features/patients/patient-header', () => ({ AllergyBanner: 'AllergyBanner' }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Input: 'Input',
  Column: 'Column',
  Row: 'Row',
  Card: 'Card',
  Text: 'Text',
  Screen: 'Screen',
  ChipSelect: 'ChipSelect',
  Toggle: 'Toggle',
  EmptyState: 'EmptyState',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, radii: {}, spacing: {} }) }));

let t: TestDatabase, patientId: string, tree: ReactTestRenderer | undefined;
let background: ((state: import('react-native').AppStateStatus) => void) | undefined;
const input = (label: string) => tree!.root.findAllByType(Input).find((node) => node.props.label === label)!;
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
const draft = () => t.db.select().from(workspaceFormDrafts).get()!;
async function settle() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
async function render() {
  await act(async () => {
    tree = create(<OrderFormScreen />);
    await settle();
  });
}
async function press(label: string) {
  await act(async () => {
    button(label).props.onPress();
    await settle();
  });
}
async function acknowledge() {
  await act(async () => {
    jest.advanceTimersByTime(3200);
    await settle();
  });
}

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Order recovery' });
  mockParams = { id: patientId };
  mockFocused = true;
  mockReadError = undefined;
  mockDelayOrderChild = false;
  mockBack.mockReset();
  jest.mocked(alertError).mockClear();
  jest.mocked(useSaveBeforeLeave).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    background = listener;
    return { remove: jest.fn() };
  });
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-02T10:00:00.123Z'));
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

describe('raw Kardex recovery through its existing editor', () => {
  it('a recovery form first mounted after replacement keeps the original allergy snapshot with old raw words', async () => {
    t.db.update(patients).set({ allergies: 'Original held allergy' }).where(eq(patients.id, patientId)).run();
    const port = orderFormPort({ patientId, encounterId: null }),
      fields = port.initial(null, new Date());
    fields.name = 'Original held raw name';
    await formQueries.saveWorkspaceDraft(
      port,
      'held-child',
      port.codec.create({ recordId: null, parentId: port.parentId, basis: null, fields }),
      0,
      datasetGeneration(),
    );
    mockParams.draftId = 'held-child';
    mockDelayOrderChild = true;
    await render();
    await act(async () => {
      const replacement = reserveDatasetReplacement();
      try {
        replacement.committed();
      } finally {
        replacement.release();
      }
      t.db.update(patients).set({ allergies: 'Replacement held allergy' }).where(eq(patients.id, patientId)).run();
      mockDelayOrderChild = false;
      tree!.update(<OrderFormScreen />);
      await settle();
    });
    expect(input('نام دارو').props.value).toBe('Original held raw name');
    expect(input('نام دارو').props.editable).toBe(false);
    expect(tree!.root.findAllByProps({ text: 'Replacement held allergy' })).toHaveLength(0);
    expect(tree!.root.findAllByProps({ text: 'Original held allergy' })).toHaveLength(1);
    expect(t.db.select().from(orders).all()).toEqual([]);
  });
  it('recovers exact raw words and invalid date without manual Save or a clinical order', async () => {
    await render();
    const words = '  unfinished\n\nclinical words with trailing spaces  ';
    await act(async () => {
      input('نام دارو').props.onChangeText('  Partial drug name  ');
      input('دوز').props.onChangeText('  partial dose  ');
      input('یادداشت').props.onChangeText(words);
      tree!.root.findByType(QuickDateField).props.onRawInputChange({ dateText: '1404/13/', customOpen: true });
    });
    await acknowledge();
    expect(draft()).toBeDefined();
    const stored = orderFormCodec.decode(draft().body);
    expect(stored.fields).toMatchObject({
      name: '  Partial drug name  ',
      dose: '  partial dose  ',
      notes: words,
      date: { dateText: '1404/13/', customOpen: true },
    });
    expect(t.db.select().from(orders).all()).toEqual([]);
    await act(async () => {
      tree!.unmount();
      await settle();
    });
    await render();
    expect(input('یادداشت').props.value).toBe(words);
    expect(input('نام دارو').props.value).toBe('  Partial drug name  ');
    expect(tree!.root.findByType(QuickDateField).props.rawInput.dateText).toBe('1404/13/');
    await press('افزودن به کاردکس');
    expect(t.db.select().from(orders).all()).toEqual([]);
    expect(draft().deletedAt).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
  });
  it.each(['background', 'close'] as const)(
    'acknowledges input on %s and keeps one route-lifetime removal guard',
    async (action) => {
      await render();
      await act(async () => input('یادداشت').props.onChangeText('  Raw fast words  '));
      if (action === 'close') await press('بستن');
      else
        await act(async () => {
          background!('background');
          await settle();
        });
      expect(orderFormCodec.decode(draft().body).fields.notes).toBe('  Raw fast words  ');
      expect(t.db.select().from(orders).all()).toEqual([]);
      expect(mockBack).toHaveBeenCalledTimes(action === 'close' ? 1 : 0);
      const guards = jest.mocked(useSaveBeforeLeave).mock.calls;
      expect(new Set(guards.map((call) => call[0])).size).toBe(1);
      expect(guards.every((call) => typeof call[1] === 'function')).toBe(true);
    },
  );
  it.each([false, true])(
    'recovers the selected original episode including null after a later admission (%s)',
    async (admitted) => {
      const original = admitted
        ? await openEncounter({ patientId, kind: 'admission', admittedAt: new Date('2025-01-01T12:00:00Z') })
        : null;
      await render();
      await act(async () => input('نام دارو').props.onChangeText('Synthetic recovered original'));
      await acknowledge();
      const selected = draft().id;
      await act(async () => {
        tree!.unmount();
        await settle();
      });
      const later = await openEncounter({ patientId, kind: 'admission', admittedAt: new Date('2025-01-03T12:00:00Z') });
      mockParams.draftId = selected;
      await render();
      expect(input('نام دارو').props.value).toBe('Synthetic recovered original');
      await press('افزودن به کاردکس');
      expect(t.db.select().from(orders).get()).toMatchObject({ patientId, encounterId: original });
      expect(t.db.select().from(orders).get()!.encounterId).not.toBe(later);
      expect(mockBack).toHaveBeenCalledTimes(1);
    },
  );
  it('a failed raw write keeps input and blocks close until an explicit successful retry', async () => {
    const save = formQueries.saveWorkspaceDraft;
    const writer = jest
      .spyOn(formQueries, 'saveWorkspaceDraft')
      .mockRejectedValue(new Error('Synthetic raw write failure'));
    await render();
    await act(async () => input('یادداشت').props.onChangeText('Raw words kept during failure'));
    await acknowledge();
    await press('بستن');
    expect(input('یادداشت').props.value).toBe('Raw words kept during failure');
    expect(mockBack).not.toHaveBeenCalled();
    expect(t.db.select().from(orders).all()).toEqual([]);
    writer.mockImplementation(save);
    await press('تلاش دوباره');
    await press('بستن');
    expect(orderFormCodec.decode(draft().body).fields.notes).toBe('Raw words kept during failure');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('retains loaded input when a query refresh fails without unmounting the guard or form', async () => {
    await render();
    await act(async () => input('یادداشت').props.onChangeText('Retained during failed refresh'));
    mockReadError = new Error('Synthetic refresh failure');
    await act(async () => {
      tree!.update(<OrderFormScreen />);
      await settle();
    });
    expect(input('یادداشت').props.value).toBe('Retained during failed refresh');
    expect(input('یادداشت').props.editable).toBe(false);
    mockReadError = undefined;
    await act(async () => {
      tree!.update(<OrderFormScreen />);
      await settle();
    });
    expect(input('یادداشت').props.value).toBe('Retained during failed refresh');
    expect(input('یادداشت').props.editable).toBe(true);
  });
  it('keeps unsupported future raw bodies copyable instead of opening an empty order', async () => {
    await render();
    await act(async () => input('نام دارو').props.onChangeText('Synthetic future raw'));
    await acknowledge();
    const row = draft(),
      body = JSON.stringify({ ...orderFormCodec.decode(row.body), version: 2 });
    await act(async () => {
      tree!.unmount();
      await settle();
    });
    t.db.update(workspaceFormDrafts).set({ body }).where(eq(workspaceFormDrafts.id, row.id)).run();
    mockParams.draftId = row.id;
    await render();
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    expect(tree!.root.findAllByType(Text).some((node) => node.props.selectable && node.props.children === body)).toBe(
      true,
    );
    expect(t.db.select().from(orders).all()).toEqual([]);
  });
  it('requires comparison and confirmation before adoption and still requires a separate clinical Save', async () => {
    const id = await createOrder({ patientId, kind: 'drug', name: 'Synthetic conflict', dose: '1 g' });
    mockParams.orderId = id;
    await render();
    await act(async () => input('یادداشت').props.onChangeText('Unpublished exact notes'));
    t.db.update(orders).set({ dose: '2 g' }).where(eq(orders.id, id)).run();
    await press('ذخیره');
    expect(t.db.select().from(orders).get()).toMatchObject({ dose: '2 g', notes: null });
    await press('مقایسهٔ نسخه‌ها');
    await press('نگه‌داشتن نسخهٔ من');
    const accept = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)?.[2]
      ?.find((entry) => entry.text === 'نگه‌داشتن نسخهٔ من')?.onPress!;
    await act(async () => {
      accept();
      await settle();
    });
    expect(t.db.select().from(orders).get()).toMatchObject({ dose: '2 g', notes: null });
    await press('ذخیره');
    expect(t.db.select().from(orders).get()).toMatchObject({ dose: '1 g', notes: 'Unpublished exact notes' });
  });
  it('a delayed discard confirmation cannot delete a draft in a replacement dataset', async () => {
    await render();
    await act(async () => input('یادداشت').props.onChangeText('Words held for confirmation'));
    await acknowledge();
    await press('حذف پیش‌نویس');
    const accept = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)?.[2]
      ?.find((entry) => entry.text === 'حذف پیش‌نویس')?.onPress!;
    const before = draft();
    const replacement = reserveDatasetReplacement();
    await act(async () => {
      try {
        replacement.committed();
      } finally {
        replacement.release();
      }
      accept();
      await settle();
    });
    expect(draft()).toEqual(before);
    expect(input('یادداشت').props.value).toBe('Words held for confirmation');
    expect(mockBack).not.toHaveBeenCalled();
    const owned = orderFormPort({ patientId, encounterId: null });
    expect(orderFormCodec.decode(draft().body).parentId).toBe(owned.parentId);
    expect(datasetGeneration()).toBeGreaterThan(0);
  });
  it('shows older drafts without carrying another patient or dataset cursor into the new list', async () => {
    const other = await createPatient({ firstName: 'Synthetic', lastName: 'Other paging owner' });
    for (const owner of [patientId, other]) {
      for (let i = 0; i < 6; i++) {
        const port = orderFormPort({ patientId: owner, encounterId: `synthetic-${i}` });
        const fields = port.initial(null, new Date());
        fields.name = `${owner === patientId ? 'First' : 'Second'} raw ${i}`;
        const document = port.codec.create({ recordId: null, parentId: port.parentId, basis: null, fields });
        await formQueries.saveWorkspaceDraft(port, `${owner}-${i}`, document, 0, datasetGeneration());
      }
    }
    const list = (owner: string) => (
      <UnfinishedWorkspaceForms
        kind="order"
        contextKey={owner}
        queryPage={(cursor) => orderDraftsQuery(owner, cursor)}
        onOpen={jest.fn()}
      />
    );
    await act(async () => {
      tree = create(list(patientId));
      await settle();
    });
    await press('قدیمی‌تر');
    expect(tree!.root.findAllByType(Pressable).map((node) => node.props.accessibilityLabel)).toContain(
      'ادامهٔ First raw 2',
    );
    await act(async () => {
      tree!.update(list(other));
      await settle();
    });
    expect(tree!.root.findAllByType(Pressable).map((node) => node.props.accessibilityLabel)).toEqual([
      'ادامهٔ Second raw 5',
      'ادامهٔ Second raw 4',
      'ادامهٔ Second raw 3',
    ]);
    await press('قدیمی‌تر');
    await act(async () => {
      const replacement = reserveDatasetReplacement();
      try {
        replacement.committed();
      } finally {
        replacement.release();
      }
      await settle();
    });
    expect(tree!.root.findAllByType(Pressable).map((node) => node.props.accessibilityLabel)).toContain(
      'ادامهٔ Second raw 5',
    );
  });
});
