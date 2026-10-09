import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Keyboard } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { alertError, notify } from '@/components/feedback';
import { Button, EmptyState, Input, Text } from '@/components/ui';
import { shiftPatients } from '@/db/schema';
import { createOrder } from '@/features/kardex/queries';
import { createLabPanel } from '@/features/labs/queries';
import { createPatient } from '@/features/patients/queries';
import { recordVital } from '@/features/vitals/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import * as queries from './queries';
import { RoundScreen } from './round-screen';
import { ShiftScreen } from './shift-screen';

const mockListeners = new Set<(event: { tableName: string }) => void>();
jest.mock('expo-sqlite', () => ({
  addDatabaseChangeListener: (listener: (event: { tableName: string }) => void) => {
    mockListeners.add(listener);
    return { remove: () => mockListeners.delete(listener) };
  },
}));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicon');
jest.mock('react-native-keyboard-controller', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: () => {} }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
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
jest.mock('@/components/picker-modal', () => ({ PickerModal: 'PickerModal' }));
jest.mock('@/features/consults/consults-brief', () => ({ ConsultsBrief: 'ConsultsBrief' }));
jest.mock('@/features/patients/patient-header', () => ({ AllergyBanner: 'AllergyBanner' }));
jest.mock('@/features/tasks/tasks-section', () => ({ TasksSection: 'TasksSection' }));

let tree: ReactTestRenderer | undefined;
let db: TestDatabase;
let firstPatientId: string;
let firstMember: string;
let secondMember: string;
const keyboard = new Map<string, () => void>();
const input = (label = 'یادداشت تحویل شیفت') => tree!.root.findAllByType(Input).find((n) => n.props.label === label)!;
const button = (label: string) => tree!.root.findAllByType(Button).find((n) => n.props.label === label)!;
const member = (id: string) =>
  db.db
    .select()
    .from(shiftPatients)
    .all()
    .find((r) => r.id === id)!;
async function settle() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}
async function render(Component = RoundScreen) {
  await act(async () => {
    tree = create(<Component />);
    await settle();
  });
  if (Component === ShiftScreen) await press('تحویل شیفت');
}
async function refreshTable(tableName: string) {
  await act(async () => {
    mockListeners.forEach((listener) => listener({ tableName }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    await settle();
  });
}
async function type(value: string) {
  await act(async () => {
    input().props.onChangeText(value);
    await settle();
  });
}
async function press(label: string) {
  await act(async () => {
    button(label).props.onPress();
    await settle();
  });
}
beforeEach(async () => {
  jest.clearAllMocks();
  mockListeners.clear();
  keyboard.clear();
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  const addListener = Keyboard.addListener.bind(Keyboard);
  jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
    keyboard.set(event, listener as () => void);
    return addListener(event, listener);
  });
  db = useTestDatabase(await createTestDatabase());
  const shiftId = await queries.startShift();
  const first = await createPatient({ firstName: 'Example', lastName: 'One' });
  const second = await createPatient({ firstName: 'Example', lastName: 'Two' });
  firstPatientId = first;
  firstMember = await queries.addPatientToShift(shiftId, first, { shiftSummary: 'First context' });
  secondMember = await queries.addPatientToShift(shiftId, second, { shiftSummary: 'Second context' });
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  tree = undefined;
  jest.restoreAllMocks();
});

describe('round footer with real autosave scope, useLive and SQLite', () => {
  it.each([RoundScreen, ShiftScreen])(
    'saves the exact last text before an externally removed member disappears (%p)',
    async (Component) => {
      await render(Component);
      const text = '  Pending handoff\n\nKeep this last line\n';
      await type(text);
      await queries.removePatientFromShift(firstMember);
      await refreshTable('shift_patients');
      expect(member(firstMember).deletedAt).not.toBeNull();
      expect(member(firstMember).handoffNote).toBe(text);
      expect(member(secondMember).handoffNote).toBeNull();
      if (Component === ShiftScreen) await press('تحویل شیفت');
      expect(input().props.value).toBe('');
    },
  );

  it.each([RoundScreen, ShiftScreen])(
    'retains text while an externally closed shift cannot yet flush (%p)',
    async (Component) => {
      await render(Component);
      await type('Final text before closing');
      db.sqlite.exec(
        "CREATE TRIGGER fail_handoff BEFORE UPDATE OF handoff_note ON shift_patients BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END;",
      );
      await queries.endShift(member(firstMember).shiftId);
      await refreshTable('shifts');
      expect(input().props.value).toBe('Final text before closing');
      expect(tree!.root.findAllByType(EmptyState)).toHaveLength(0);
      db.sqlite.exec('DROP TRIGGER fail_handoff;');
      await press('ذخیره و ادامه');
      expect(member(firstMember).handoffNote).toBe('Final text before closing');
      expect(tree!.root.findByType(EmptyState).props.title).toBe('شیفتی باز نیست');
    },
  );

  it('does not unmount the round input on external completion until storage succeeds', async () => {
    await render();
    await type('Before another screen marked seen');
    db.sqlite.exec(
      "CREATE TRIGGER fail_handoff BEFORE UPDATE OF handoff_note ON shift_patients BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END;",
    );
    await queries.setShiftPatientReviewed(firstMember, true);
    await queries.setShiftPatientReviewed(secondMember, true);
    await refreshTable('shift_patients');
    expect(input().props.value).toBe('Before another screen marked seen');
    expect(button('دیدم و بعدی').props.disabled).toBe(true);
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(0);
    db.sqlite.exec('DROP TRIGGER fail_handoff;');
    await press('ذخیره و ادامه');
    expect(member(firstMember).handoffNote).toBe('Before another screen marked seen');
    expect(tree!.root.findByType(EmptyState).props.title).toBe('راند تمام شد');
  });

  it('adopts only the latest shift when a second switch arrives during a slow write', async () => {
    await render();
    const original = queries.saveShiftPatientText;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.spyOn(queries, 'saveShiftPatientText').mockImplementation(async (target, patch) => {
      await gate;
      await original(target, patch);
    });
    await type('Belongs to first');
    const intermediateShift = await queries.startShift();
    const intermediatePatient = await createPatient({ firstName: 'Intermediate', lastName: 'Patient' });
    const intermediateMember = await queries.addPatientToShift(intermediateShift, intermediatePatient, {
      shiftSummary: 'Intermediate context',
    });
    await refreshTable('shifts');
    expect(input().props.value).toBe('Belongs to first');
    expect(button('بعدی').props.disabled).toBe(true);
    const lastShift = await queries.startShift();
    const lastPatient = await createPatient({ firstName: 'Last', lastName: 'Patient' });
    const lastMember = await queries.addPatientToShift(lastShift, lastPatient, { shiftSummary: 'Last context' });
    await refreshTable('shifts');
    // A change typed while the first write waits must also reach the original row.
    await type('Newest words still belong to first');
    await act(async () => {
      release();
      await settle();
    });
    if (button('ذخیره و ادامه')) await press('ذخیره و ادامه');
    expect(input('نکته‌ی این شیفت').props.value).toBe('Last context');
    expect(member(firstMember).handoffNote).toBe('Newest words still belong to first');
    expect(member(intermediateMember).handoffNote).toBeNull();
    expect(member(lastMember).handoffNote).toBeNull();
  });

  it.each([RoundScreen, ShiftScreen])(
    'retains the previous shift text when a new shift arrives during a failed save (%p)',
    async (Component) => {
      await render(Component);
      await type('Text belongs to the previous shift');
      db.sqlite.exec(
        "CREATE TRIGGER fail_handoff BEFORE UPDATE OF handoff_note ON shift_patients BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END;",
      );
      const nextShift = await queries.startShift();
      const nextPatient = await createPatient({ firstName: 'Example', lastName: 'Next' });
      const nextMember = await queries.addPatientToShift(nextShift, nextPatient, {
        shiftSummary: 'Next shift context',
      });
      await refreshTable('shifts');
      expect(input().props.value).toBe('Text belongs to the previous shift');
      expect(tree!.root.findAllByType(EmptyState)).toHaveLength(0);
      expect(member(firstMember).handoffNote).toBeNull();
      expect(member(nextMember).handoffNote).toBeNull();
      db.sqlite.exec('DROP TRIGGER fail_handoff;');
      await press('ذخیره و ادامه');
      expect(member(firstMember).handoffNote).toBe('Text belongs to the previous shift');
      expect(member(nextMember).handoffNote).toBeNull();
      if (Component === ShiftScreen) await press('تحویل شیفت');
      expect(input().props.value).toBe('');
    },
  );

  it('awaits pending text before advancing and makes repeated taps one reviewed write', async () => {
    await render();
    await type('Handoff to keep');
    const original = queries.saveShiftPatientText;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.spyOn(queries, 'saveShiftPatientText').mockImplementation(async (id, patch) => {
      await gate;
      await original(id, patch);
    });
    const reviewed = jest.spyOn(queries, 'setShiftPatientReviewed');
    const next = button('دیدم و بعدی');
    await act(async () => {
      next.props.onPress();
      next.props.onPress();
      await settle();
    });
    expect(reviewed).not.toHaveBeenCalled();
    expect(input().props.value).toBe('Handoff to keep');
    expect(member(firstMember).handoffNote).toBeNull();
    expect(input('نکته‌ی این شیفت').props.value).toBe('First context');
    await act(async () => {
      release();
      await settle();
    });
    expect(reviewed).toHaveBeenCalledTimes(1);
    expect(member(firstMember).handoffNote).toBe('Handoff to keep');
    expect(member(firstMember).reviewedAt).not.toBeNull();
    expect(member(secondMember).reviewedAt).toBeNull();
    expect(input('نکته‌ی این شیفت').props.value).toBe('Second context');
  });
  it('keeps the exact text and patient when flush resolves false, and retries before skip', async () => {
    await render();
    await type('Do not lose this');
    db.sqlite.exec(
      "CREATE TRIGGER fail_handoff BEFORE UPDATE OF handoff_note ON shift_patients BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END;",
    );
    await press('دیدم و بعدی');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(member(firstMember).reviewedAt).toBeNull();
    expect(input().props.value).toBe('Do not lose this');
    expect(input('نکته‌ی این شیفت').props.value).toBe('First context');
    db.sqlite.exec('DROP TRIGGER fail_handoff;');
    await press('بعدی');
    expect(member(firstMember).handoffNote).toBe('Do not lose this');
    expect(member(firstMember).reviewedAt).toBeNull();
    expect(member(secondMember).reviewedAt).toBeNull();
    expect(input('نکته‌ی این شیفت').props.value).toBe('Second context');
  });
  it('keeps a saved handoff and the same patient after a reviewed-write rejection', async () => {
    await render();
    await type('Saved even if review fails');
    db.sqlite.exec(
      "CREATE TRIGGER fail_review BEFORE UPDATE OF reviewed_at ON shift_patients WHEN NEW.reviewed_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'synthetic review failure'); END;",
    );
    await press('دیدم و بعدی');
    expect(alertError).toHaveBeenCalledTimes(1);
    expect(member(firstMember).reviewedAt).toBeNull();
    expect(member(firstMember).handoffNote).toBe('Saved even if review fails');
    expect(input('نکته‌ی این شیفت').props.value).toBe('First context');
    db.sqlite.exec('DROP TRIGGER fail_review;');
  });
  it('hides only the footer for the keyboard and flushes retained input after dismissal', async () => {
    await render();
    await type('While keyboard visible');
    await act(async () => {
      keyboard.get('keyboardDidShow')!();
    });
    expect(button('دیدم و بعدی')).toBeUndefined();
    expect(input().props.value).toBe('While keyboard visible');
    await act(async () => {
      keyboard.get('keyboardDidHide')!();
    });
    await press('بعدی');
    expect(member(firstMember).handoffNote).toBe('While keyboard visible');
    expect(member(firstMember).reviewedAt).toBeNull();
  });
  it('retains input and blocks both actions when a membership refresh fails', async () => {
    await render();
    await type('Before read failure');
    const prepare = db.sqlite.prepare.bind(db.sqlite);
    let broken = true;
    jest.spyOn(db.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (broken && sql.includes('left join "shift_patients"')) throw new Error('synthetic membership read failure');
      return prepare(sql, params);
    });
    await act(async () => {
      mockListeners.forEach((listener) => listener({ tableName: 'shift_patients' }));
      await new Promise((resolve) => setTimeout(resolve, 80));
      await settle();
    });
    expect(tree!.root.findAllByType(ErrorNotice).some((n) => n.props.error)).toBe(true);
    expect(button('دیدم و بعدی').props.disabled).toBe(true);
    expect(button('بعدی').props.disabled).toBe(true);
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(0);
    expect(input().props.value).toBe('Before read failure');
    await press('دیدم و بعدی');
    broken = false;
    expect(member(firstMember).reviewedAt).toBeNull();
    await act(async () => {
      tree!.root
        .findAllByType(ErrorNotice)
        .find((n) => n.props.error)!
        .props.onRetry();
      await settle();
    });
    await press('بعدی');
    expect(member(firstMember).handoffNote).toBe('Before read failure');
  });
});

describe('bedside round cockpit', () => {
  it('renders vitals chips, running kardex orders, and flagged labs with quick navigation buttons', async () => {
    await recordVital({
      patientId: firstPatientId,
      systolic: 120,
      diastolic: 80,
      heartRate: 72,
      spo2: 98,
      measuredAt: new Date(),
    });
    await createOrder({
      patientId: firstPatientId,
      kind: 'drug',
      name: 'Cefazolin',
      dose: '1g',
      route: 'IV',
      frequency: 'Q8H',
      startAt: new Date(),
    });
    await createLabPanel({
      patientId: firstPatientId,
      collectedAt: new Date(),
      source: 'manual',
      values: [{ analyte: 'Cr', value: '3.4', refLow: 0.6, refHigh: 1.2 }],
    });

    await render(RoundScreen);

    // Bedside shortcut buttons exist
    const vitalsBtn = button('علائم');
    const kardexBtn = button('کاردکس');
    expect(vitalsBtn).toBeDefined();
    expect(kardexBtn).toBeDefined();

    // Clicking them routes directly to patient vitals/kardex tab
    await act(async () => {
      vitalsBtn.props.onPress();
      await settle();
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/patient/[id]',
      params: { id: firstPatientId, tab: 'vitals' },
    });

    await act(async () => {
      kardexBtn.props.onPress();
      await settle();
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/patient/[id]',
      params: { id: firstPatientId, tab: 'kardex' },
    });

    // Check rendered text content
    const textNodes = tree!.root.findAllByType(Text);
    const renderedTexts = textNodes.map((n) =>
      Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? ''),
    );
    expect(renderedTexts.some((t) => t.includes('علائم حیاتی'))).toBe(true);
    expect(renderedTexts.some((t) => t.includes('Cefazolin'))).toBe(true);
    expect(renderedTexts.some((t) => t.includes('آزمایش‌های هشدار'))).toBe(true);
    expect(renderedTexts.some((t) => t.includes('Cr'))).toBe(true);
  });
});
