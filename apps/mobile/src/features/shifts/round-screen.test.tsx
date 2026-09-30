import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Keyboard } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { alertError, notify } from '@/components/feedback';
import { Button, EmptyState, Input } from '@/components/ui';
import { shiftPatients } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import * as queries from './queries';
import { RoundScreen } from './round-screen';

const mockListeners = new Set<(event: { tableName: string }) => void>();
jest.mock('expo-sqlite', () => ({
  addDatabaseChangeListener: (listener: (event: { tableName: string }) => void) => {
    mockListeners.add(listener);
    return { remove: () => mockListeners.delete(listener) };
  },
}));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
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
  Input: 'Input',
  Row: 'Row',
  Screen: 'Screen',
  Text: 'Text',
}));
jest.mock('@/features/consults/consults-brief', () => ({ ConsultsBrief: 'ConsultsBrief' }));
jest.mock('@/features/patients/patient-header', () => ({ AllergyBanner: 'AllergyBanner' }));
jest.mock('@/features/tasks/tasks-section', () => ({ TasksSection: 'TasksSection' }));

let tree: ReactTestRenderer | undefined;
let db: TestDatabase;
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
async function render() {
  await act(async () => {
    tree = create(<RoundScreen />);
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
  it('awaits pending text before advancing and makes repeated taps one reviewed write', async () => {
    await render();
    await type('Handoff to keep');
    const original = queries.updateShiftPatient;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.spyOn(queries, 'updateShiftPatient').mockImplementation(async (id, patch) => {
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
      if (broken && sql.includes('from "shift_patients"')) throw new Error('synthetic membership read failure');
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
