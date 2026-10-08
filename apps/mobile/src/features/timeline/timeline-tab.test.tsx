import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { useEffect } from 'react';
import { Pressable } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { Button, ChipSelect, EmptyState, Text } from '@/components/ui';
import { tablesOf as mockTablesOf } from '@/db/query-tables';
import { consultations, encounters, imagingStudies, labPanels, labValues, notes } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { stamps } from '@/lib/ids';
import { snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { TimelineTab } from './timeline-tab';

const mockPush = jest.fn();
let mockFocused = true;
const mockFailures = new Set<string>();
const mockCache = new Map<string, unknown[]>();
const mockRetried = jest.fn((table: string) => mockFailures.delete(table));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({ isFocused: () => mockFocused }) }));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: () => {} }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('react-native', () => {
  const native = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy(native, { get: (target, key) => (key === 'Pressable' ? 'Pressable' : Reflect.get(target, key)) });
});
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[]; toSQL(): unknown }) => {
    const failed = mockTablesOf(query).find((table) => mockFailures.has(table));
    const key = JSON.stringify(query.toSQL());
    if (!failed) mockCache.set(key, query.all());
    return {
      data: mockCache.get(key),
      error: failed ? new Error('Synthetic failure') : undefined,
      loading: false,
      retry: () => failed && mockRetried(failed),
    };
  },
}));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  EmptyState: 'EmptyState',
  Row: 'Row',
  Text: 'Text',
}));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {} }) }));

let t: TestDatabase, patientId: string, tree: ReactTestRenderer | undefined;
let scope: NonNullable<ReturnType<typeof useAutosaveScope>>;
const mockScroll = jest.fn();
const at = new Date('2026-10-08T12:00:00Z');
function ScopeProbe() {
  const current = useAutosaveScope()!;
  useEffect(() => {
    scope = current;
  }, [current]);
  return null;
}
const app = () => (
  <AutosaveScope>
    <ScopeProbe />
    <TimelineTab patientId={patientId} onPageChange={mockScroll} />
  </AutosaveScope>
);
const settle = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
async function render() {
  await act(async () => {
    tree = create(app());
    await settle();
  });
}
async function refresh() {
  await act(async () => {
    tree!.update(app());
    await settle();
  });
}
const rows = () => tree!.root.findAllByType(Pressable);
const text = () =>
  tree!.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .flat()
    .join(' ');
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
async function press(node: ReactTestInstance) {
  await act(async () => {
    node.props.onPress();
    await settle();
  });
}
const seedNotes = (count: number) => {
  for (let i = 0; i < count; i++)
    t.db
      .insert(notes)
      .values({
        id: `note${i}`,
        patientId,
        type: 'general',
        body: `Body${i}`,
        noteDate: new Date(at.getTime() - i * 1000),
        ...stamps(at),
      })
      .run();
};
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Timeline' });
  mockFailures.clear();
  mockCache.clear();
  mockPush.mockClear();
  mockRetried.mockClear();
  mockScroll.mockClear();
  mockFocused = true;
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});

describe('timeline controls and original navigation ownership', () => {
  it('replaces pages instead of growing the scroll tree, returns to newer rows and resets on filter change', async () => {
    seedNotes(95);
    await render();
    expect(rows()).toHaveLength(40);
    expect(text()).toContain('Body0');
    await press(button('قدیمی‌تر'));
    expect(rows()).toHaveLength(40);
    expect(text()).toContain('Body40');
    expect(text()).not.toContain('Body0 ');
    await press(button('قدیمی‌تر'));
    expect(rows()).toHaveLength(15);
    expect(button('قدیمی‌تر')).toBeUndefined();
    await press(button('جدیدتر'));
    expect(text()).toContain('Body40');
    await act(async () => tree!.root.findByType(ChipSelect).props.onChange('lab'));
    expect(rows()).toHaveLength(0);
    expect(tree!.root.findByType(EmptyState).props.title).toBe('رویدادی در این بخش نیست');
    expect(button('جدیدتر')).toBeUndefined();
    expect(tree!.root.findByType(ChipSelect).props.value).toBe('lab');
    await act(async () => tree!.root.findByType(ChipSelect).props.onChange('note'));
    expect(text()).toContain('Body0');
    expect(mockScroll).toHaveBeenCalledTimes(5);
  });
  it('keeps good rows, refuses to skip a failed source, and retries only the failed read', async () => {
    seedNotes(45);
    await render();
    mockFailures.add('lab_panels');
    await refresh();
    expect(rows()).toHaveLength(40);
    expect(button('قدیمی‌تر').props.disabled).toBe(true);
    expect(text()).toContain('فهرست کامل نیست');
    await act(async () => tree!.root.findByType(ErrorNotice).props.onRetry());
    await refresh();
    expect(mockRetried.mock.calls).toEqual([['lab_panels']]);
    expect(button('قدیمی‌تر').props.disabled).toBe(false);
  });
  it('reads a six-result lab preview with units and an explicit remaining count', async () => {
    t.db
      .insert(labPanels)
      .values({ id: 'panel', patientId, collectedAt: at, source: 'manual', ...stamps(at) })
      .run();
    for (let i = 0; i < 20; i++)
      t.db
        .insert(labValues)
        .values({
          id: `value${i}`,
          panelId: 'panel',
          patientId,
          analyte: `A${i}`,
          value: '10',
          unit: 'mg/dL',
          valueNum: 10,
          sortOrder: i,
          ...stamps(at),
        })
        .run();
    await render();
    expect(text()).toContain('mg/dL');
    expect(text()).toContain('۶ از ۲۰ نتیجه');
    expect(text()).not.toContain('A6 ');
    mockFailures.add('lab_values');
    await refresh();
    expect(tree!.root.findByType(ErrorNotice).props.what).toContain('نتیجه‌ی آزمایش‌ها');
    expect(text()).toContain('فهرست کامل نیست');
  });
  it('opens each actual record in one tap without a detour through its tab', async () => {
    seedNotes(1);
    t.db
      .insert(labPanels)
      .values({ id: 'lab', patientId, collectedAt: at, source: 'manual', ...stamps(at) })
      .run();
    t.db
      .insert(imagingStudies)
      .values({ id: 'image', patientId, modality: 'ct', studyDate: at, ...stamps(at) })
      .run();
    t.db
      .insert(consultations)
      .values({ id: 'consult', patientId, reason: 'Question', requestedAt: at, ...stamps(at) })
      .run();
    t.db
      .insert(encounters)
      .values({ id: 'enc', patientId, kind: 'outpatient', admittedAt: at, ...stamps(at) })
      .run();
    await render();
    for (const row of rows()) await press(row);
    expect(mockPush.mock.calls.map(([href]) => href)).toEqual([
      { pathname: '/consult-answer', params: { consultId: 'consult' } },
      { pathname: '/patient/[id]/encounter', params: { id: patientId, encounterId: 'enc' } },
      { pathname: '/patient/[id]/imaging', params: { id: patientId, studyId: 'image' } },
      { pathname: '/patient/[id]/lab', params: { id: patientId, panelId: 'lab' } },
      { pathname: '/patient/[id]/note', params: { id: patientId, noteId: 'note0' } },
    ]);
  });
  it('does not navigate while another field cannot be acknowledged', async () => {
    seedNotes(1);
    await render();
    scope.group.register({ unsaved: true, flush: async () => false });
    await press(rows()[0]!);
    expect(mockPush).not.toHaveBeenCalled();
  });
  it.each(['unfocused', 'unmounted', 'replacement'] as const)(
    'does not use a delayed navigation after %s',
    async (kind) => {
      seedNotes(1);
      const replace = snapshotDataset(t);
      await render();
      let done!: () => void;
      scope.group.register({
        unsaved: false,
        flush: () =>
          new Promise<boolean>((resolve) => {
            done = () => resolve(true);
          }),
      });
      await act(async () => {
        rows()[0]!.props.onPress();
        await settle();
      });
      if (kind === 'unfocused') mockFocused = false;
      if (kind === 'unmounted') await act(async () => tree!.unmount());
      if (kind === 'replacement') await act(async () => replace());
      await act(async () => {
        done();
        await settle();
      });
      expect(mockPush).not.toHaveBeenCalled();
    },
  );
  it('ignores a double tap while the original scope is flushing', async () => {
    seedNotes(1);
    await render();
    let done!: () => void;
    scope.group.register({
      unsaved: false,
      flush: () =>
        new Promise<boolean>((resolve) => {
          done = () => resolve(true);
        }),
    });
    await act(async () => {
      rows()[0]!.props.onPress();
      rows()[0]!.props.onPress();
      await settle();
    });
    await act(async () => {
      done();
      await settle();
    });
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
  it('never treats a previewed ambiguous value as normal or parses a truncated numeric string', async () => {
    t.db
      .insert(labPanels)
      .values({ id: 'panel', patientId, collectedAt: at, source: 'manual', ...stamps(at) })
      .run();
    t.db
      .insert(labValues)
      .values({ id: 'ambiguous', panelId: 'panel', patientId, analyte: 'Unknown', value: '5,8', ...stamps(at) })
      .run();
    t.db
      .insert(labValues)
      .values({ id: 'long', panelId: 'panel', patientId, analyte: 'Long', value: '9'.repeat(500), ...stamps(at) })
      .run();
    await render();
    expect(text()).toContain('Unknown 5,8 ?');
    expect(text()).toContain('…');
    expect(text()).not.toContain('… ?');
    t.db.update(labValues).set({ deletedAt: at }).where(eq(labValues.id, 'ambiguous')).run();
    await refresh();
    expect(text()).not.toContain('Unknown');
  });
});
