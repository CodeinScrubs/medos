import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { Button, IconButton, Input, Text } from '@/components/ui';
import { shiftPatients } from '@/db/schema';
import { openEncounter } from '@/features/encounters/queries';
import { createPatient } from '@/features/patients/queries';
import { createTask, setTaskStatus } from '@/features/tasks/queries';
import { fromJalali } from '@/lib/jalali';
import { databaseRows, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { matchesShiftDeck, shiftPatientBrief, type ShiftDeckRow } from './deck';
import { activeShiftWorkspaceQuery, addPatientToShift, startShift } from './queries';
import { ShiftCard } from './shift-card';
import { ShiftScreen } from './shift-screen';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockListeners = new Set<(event: { tableName: string }) => void>();
let mockClock: number;
let mockFlush: (() => Promise<boolean>) | null;
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));
jest.mock('expo-sqlite', () => ({
  addDatabaseChangeListener: (listener: (event: { tableName: string }) => void) => {
    mockListeners.add(listener);
    return { remove: () => mockListeners.delete(listener) };
  },
}));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/use-now', () => ({ useNow: () => mockClock }));
jest.mock('@/components/use-save-before-leave', () => ({
  useSaveBeforeLeave: (flush: () => Promise<boolean>) => {
    mockFlush = flush;
  },
}));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('@/components/picker-modal', () => ({ PickerModal: 'PickerModal' }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicon');
jest.mock('@/components/ui', () => ({
  Badge: 'Badge',
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  EmptyState: 'EmptyState',
  IconButton: 'IconButton',
  Input: 'Input',
  Row: 'Row',
  Screen: 'Screen',
  SectionHeader: 'SectionHeader',
  Text: 'Text',
}));

let t: TestDatabase;
let tree: ReactTestRenderer | undefined;
let rows: ShiftDeckRow[];
const input = (label: string) => tree!.root.findAllByType(Input).find((n) => n.props.label === label)!;
const button = (label: string) => tree!.root.findAllByType(Button).find((n) => n.props.label === label)!;
const textNodes = () => tree!.root.findAllByType(Text);
async function settle() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
async function mount(Component: typeof ShiftScreen | typeof ShiftCard) {
  await act(async () => {
    tree = create(<Component />);
    await settle();
  });
}
async function press(label: string) {
  await act(async () => {
    button(label).props.onPress();
    await settle();
  });
}
async function type(label: string, value: string) {
  await act(async () => {
    input(label).props.onChangeText(value);
    await settle();
  });
}
async function refresh(tableName: string) {
  await act(async () => {
    mockListeners.forEach((listener) => listener({ tableName }));
    jest.advanceTimersByTime(80);
    await settle();
  });
}
beforeEach(async () => {
  jest.clearAllMocks();
  mockListeners.clear();
  mockFlush = null;
  t = useTestDatabase(await createTestDatabase());
  mockClock = fromJalali(1405, 7, 16).getTime() + 13 * 3600000;
  const shiftId = await startShift({ startAt: new Date(mockClock) });
  for (let i = 1; i <= 40; i++) {
    const patientId = await createPatient({
      firstName: 'Synthetic',
      lastName: `Patient ${i}`,
      ageYears: 20 + i,
      sex: i % 2 ? 'female' : 'male',
    });
    await openEncounter({
      patientId,
      kind: 'admission',
      ward: 'Ward',
      bed: `BED-${i}`,
      admittedAt: new Date(mockClock - 25 * 3600000),
      admittedAtHasTime: true,
    });
    await addPatientToShift(shiftId, patientId, { shiftSummary: `Impression ${i}` });
    await createTask({ patientId, title: `Review result ${i}` });
  }
  rows = activeShiftWorkspaceQuery()
    .all()
    .flatMap(({ member, patient, encounter, nextTask }) =>
      member && patient ? [{ member, patient, encounter, nextTask }] : [],
    );
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.useFakeTimers();
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  tree = undefined;
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('40-patient deck with real reads, autosave and write admission', () => {
  it('keeps Today compact, searches the last patient, and opens the exact record/action in one tap', async () => {
    await mount(ShiftCard);
    expect(textNodes().filter((n) => String(n.props.children).startsWith('Synthetic Patient '))).toHaveLength(4);
    await type('جستجو در شیفت', 'BED-40');
    expect(
      textNodes()
        .filter((n) => String(n.props.children).startsWith('Synthetic Patient '))
        .map((n) => n.props.children),
    ).toEqual(['Synthetic Patient 40']);
    await act(async () => {
      tree!.root
        .findAll(
          (n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'پروندهٔ Synthetic Patient 40',
        )[0]!
        .props.onPress();
      tree!.root
        .findAll(
          (n) => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel).startsWith('اقدام بعدی:'),
        )[0]!
        .props.onPress();
    });
    expect(mockPush.mock.calls).toEqual([
      [{ pathname: '/patient/[id]', params: { id: rows[39]!.patient.id } }],
      [{ pathname: '/task', params: { taskId: rows[39]!.nextTask!.id } }],
    ]);
  });
  it('observes task changes in the same deck and never continues to show a completed task', async () => {
    await mount(ShiftCard);
    await type('جستجو در شیفت', 'BED-40');
    expect(
      tree!.root.findAll(
        (n) => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel).startsWith('اقدام بعدی:'),
      ).length,
    ).toBeGreaterThan(0);
    await setTaskStatus(rows[39]!.nextTask!.id, 'done');
    await refresh('tasks');
    expect(
      tree!.root.findAll(
        (n) => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel).startsWith('اقدام بعدی:'),
      ),
    ).toHaveLength(0);
  });
  it('retains a hidden patient editor while searching, then flushes it before a persistent reorder', async () => {
    await mount(ShiftScreen);
    await press('تحویل شیفت');
    const exact = '  End of shift\n\nLast line\n';
    await type('یادداشت تحویل شیفت', exact);
    await type('جستجو در شیفت', 'BED-40');
    expect(input('یادداشت تحویل شیفت').props.value).toBe(exact);
    expect(
      t.db
        .select()
        .from(shiftPatients)
        .all()
        .find((r) => r.id === rows[0]!.member.id)?.handoffNote,
    ).toBeNull();
    await type('جستجو در شیفت', '');
    await press('ترتیب راند');
    await act(async () => {
      tree!.root
        .findAllByType(IconButton)
        .find((n) => n.props.label === 'پایین‌تر در راند' && !n.props.disabled)!
        .props.onPress();
      await settle();
    });
    await refresh('shift_patients');
    const fresh = activeShiftWorkspaceQuery().all();
    expect(fresh[0]?.member?.id).toBe(rows[1]!.member.id);
    expect(fresh[1]?.member?.handoffNote).toBe(exact);
    expect(input('یادداشت تحویل شیفت').props.value).toBe(exact);
    const before = databaseRows(t);
    await press('بستن تحویل');
    expect(databaseRows(t)).toEqual(before);
    expect(tree!.root.findAllByType(Input).filter((n) => n.props.label === 'یادداشت تحویل شیفت')).toHaveLength(0);
  });
  it('retains the expanded handoff and prevents collapse/reorder after a failed save', async () => {
    await mount(ShiftScreen);
    await press('تحویل شیفت');
    await type('یادداشت تحویل شیفت', 'Must stay visible');
    t.conn.execSync(
      "CREATE TRIGGER fail_handoff BEFORE UPDATE OF handoff_note ON shift_patients BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    await press('بستن تحویل');
    expect(input('یادداشت تحویل شیفت').props.value).toBe('Must stay visible');
    await act(async () => expect(await mockFlush!()).toBe(false));
    t.conn.execSync('DROP TRIGGER fail_handoff');
    await press('بستن تحویل');
    expect(
      t.db
        .select()
        .from(shiftPatients)
        .all()
        .find((r) => r.id === rows[0]!.member.id)?.handoffNote,
    ).toBe('Must stay visible');
  });
  it('retains text after real restore and gives an explicit exit without mutating the restored rows', async () => {
    await mount(ShiftScreen);
    await press('تحویل شیفت');
    await type('یادداشت تحویل شیفت', 'Old context');
    await act(async () => {
      snapshotDataset(t)();
      await settle();
    });
    const restored = databaseRows(t);
    expect(input('یادداشت تحویل شیفت').props.value).toBe('Old context');
    await press('بستن تحویل');
    expect(databaseRows(t)).toEqual(restored);
    await press('بستن شیفت قدیمی');
    const accepted = jest.mocked(Alert.alert).mock.calls.at(-1)![2]![1]!;
    await act(async () => {
      accepted.onPress!();
      accepted.onPress!();
      await settle();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
    await act(async () => expect(await mockFlush!()).toBe(true));
    expect(databaseRows(t)).toEqual(restored);
  });
  it('shows a failed deck read with retry, preserving the search until recovery', async () => {
    await mount(ShiftCard);
    await type('جستجو در شیفت', 'BED-40');
    const prepare = t.sqlite.prepare.bind(t.sqlite);
    let broken = true;
    jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (broken && sql.includes('left join "shift_patients"')) throw new Error('synthetic failure');
      return prepare(sql, params);
    });
    await refresh('tasks');
    expect(input('جستجو در شیفت').props.value).toBe('BED-40');
    expect(button('راند').props.disabled).toBe(true);
    broken = false;
    await act(async () => {
      tree!.root
        .findAllByType(ErrorNotice)
        .find((n) => n.props.error)!
        .props.onRetry();
      await settle();
    });
    expect(input('جستجو در شیفت').props.value).toBe('BED-40');
    expect(button('راند').props.disabled).toBe(false);
  });
  it('keeps clinical age Latin and folds search across Persian digits and letters', () => {
    const brief = shiftPatientBrief(rows[0]!, new Date(mockClock));
    expect(brief.ageSex).toContain('21');
    expect(brief.ageSex).not.toMatch(/[۰-۹]/);
    expect(matchesShiftDeck(rows[39]!, 'bed ۴۰')).toBe(true);
    expect(
      matchesShiftDeck(
        { ...rows[0]!, patient: { ...rows[0]!.patient, firstName: 'علي', lastName: 'كريمي' } },
        'علی کریمی',
      ),
    ).toBe(true);
    expect(matchesShiftDeck(rows[0]!, 'not present')).toBe(false);
    const closed = { ...rows[0]!, encounter: { ...rows[0]!.encounter!, isActive: false, dischargedAt: null } };
    expect(shiftPatientBrief(closed, new Date(mockClock)).admission).toBe(
      shiftPatientBrief(closed, new Date(mockClock + 30 * 86400000)).admission,
    );
  });
});
