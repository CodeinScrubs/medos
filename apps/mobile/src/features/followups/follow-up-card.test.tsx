import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { Alert, Linking, Modal, Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AutosaveScope } from '@/components/autosave-scope';
import { alertError } from '@/components/feedback';
import { PromptModal } from '@/components/prompt-modal';
import { Button, Input } from '@/components/ui';
import { restoreDatabase } from '@/db/client';
import { followUps, patients } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { createPatient } from '@/features/patients/queries';
import { DatasetBusyError, DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';
import * as notifications from '@/platform/notifications';
import { useTestDatabase } from '@/test/db-client';
import { resetNotifications } from '@/test/mocks/notifications';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { FollowUpCard } from './follow-up-card';
import { postponedDueDate } from './logic';
import { createFollowUp } from './queries';

// Keep the real PromptModal; expose native press handlers without native hit testing.
jest.mock('react-native', () => {
  const native = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy(native, { get: (target, key) => (key === 'Pressable' ? 'Pressable' : Reflect.get(target, key)) });
});
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicon');
jest.mock('react-native-keyboard-controller', () => ({ KeyboardController: { isVisible: () => false } }));
jest.mock('@/components/feedback', () => ({
  alertError: jest.fn(),
  notify: jest.requireActual<typeof import('@/components/feedback')>('@/components/feedback').notify,
}));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: () => {} }));
jest.mock('@/components/ui', () => ({
  Badge: 'Badge',
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  Input: 'Input',
  Row: 'Row',
  Text: 'Text',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {}, radii: {}, shadows: {} }) }));

let t: TestDatabase;
let tree: ReactTestRenderer | undefined;
let snapshotCounter = 0;
const current = () => t.db.select().from(followUps).get()!;
const currentPatient = () => t.db.select().from(patients).where(eq(patients.id, current().patientId)).get()!;
function scoped(show = true) {
  return (
    <AutosaveScope>{show ? <FollowUpCard followUp={current()} patient={currentPatient()} /> : null}</AutosaveScope>
  );
}
function snapshot() {
  const path = `/follow-up-card-intent-${++snapshotCounter}.db`;
  t.sqlite.exec(`VACUUM INTO '${path}'`);
  return () => {
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
  };
}
async function settle() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
async function render(show = true) {
  await act(async () => {
    tree = create(scoped(show));
  });
}
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
const prompt = () => tree!.root.findByType(PromptModal);
const action = (label: string) =>
  tree!.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0]!;
const card = () => tree!.root.findAllByType(Pressable).find((node) => typeof node.props.onLongPress === 'function')!;
async function invoke(onPress: () => void) {
  await act(async () => {
    onPress();
    await settle();
  });
}
async function ask(label: string, choice: string) {
  await invoke(action(label).props.onPress);
  return jest
    .mocked(Alert.alert)
    .mock.calls.at(-1)![2]!
    .find((button) => button.text === choice)!.onPress!;
}
async function askMore(choice: string) {
  await invoke(card().props.onLongPress);
  return jest
    .mocked(Alert.alert)
    .mock.calls.at(-1)![2]!
    .find((button) => button.text === choice)!.onPress!;
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  resetNotifications();
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const patientId = await createPatient({ firstName: 'Test', lastName: 'Patient', phone: '+12025550123' });
  await createFollowUp({
    patientId,
    dueAt: new Date(Date.now() + 86_400_000),
    reason: 'Review',
    channel: 'call',
    priority: 'normal',
  });
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
  tree = undefined;
  jest.restoreAllMocks();
});

describe('follow-up card save and retry', () => {
  it('keeps the completion dialog and typed outcome after a failed save, then allows retry', async () => {
    await render();
    await act(async () => {
      action('انجام شد').props.onPress();
    });
    await act(async () => {
      tree!.root.findByType(Input).props.onChangeText('Outcome to preserve');
    });
    t.sqlite.exec(
      "CREATE TRIGGER fail_completion BEFORE UPDATE ON follow_ups BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    const submit = () =>
      tree!.root
        .findAllByType(Button)
        .find((node) => node.props.label === 'ثبت')!
        .props.onPress();
    await act(async () => {
      submit();
      await settle();
    });
    expect(alertError).toHaveBeenCalledTimes(1);
    expect(tree!.root.findByType(PromptModal).props.visible).toBe(true);
    expect(tree!.root.findByType(Input).props.value).toBe('Outcome to preserve');
    expect(current()).toMatchObject({ status: 'pending', outcome: null });
    t.sqlite.exec('DROP TRIGGER fail_completion;');
    await act(async () => {
      submit();
      submit();
      await settle();
    });
    expect(tree!.root.findByType(PromptModal).props.visible).toBe(false);
    expect(current()).toMatchObject({ status: 'done', outcome: 'Outcome to preserve', reminderRevision: 1 });
  });

  it('shows retry only for unavailable reminders and removes it when repair succeeds', async () => {
    const id = current().id;
    jest.spyOn(notifications, 'scheduleReminder').mockRejectedValueOnce(new Error('native unavailable'));
    const { updateFollowUp } = jest.requireActual<typeof import('./queries')>('./queries');
    await updateFollowUp(id, { reason: 'Updated review' });
    await render();
    expect(action('تلاش مجدد')).toBeDefined();
    await act(async () => {
      action('تلاش مجدد').props.onPress();
      await settle();
    });
    await act(async () => {
      tree!.update(scoped());
    });
    expect(action('تلاش مجدد')).toBeUndefined();
    expect(current().reminderAppliedRevision).toBe(current().reminderRevision);
  });
});

describe('follow-up card dataset intent', () => {
  it('preserves the actual typed completion outcome after same-ID restore and refuses publication', async () => {
    const original = current();
    const restore = snapshot();
    await render();
    await invoke(action('انجام شد').props.onPress);
    await act(async () => tree!.root.findByType(Input).props.onChangeText('Unpublished outcome'));
    const complete = button('ثبت').props.onPress;
    await act(async () => {
      restore();
      tree!.update(scoped());
    });
    await invoke(complete);
    expect(current()).toEqual(original);
    expect(prompt().props.visible).toBe(true);
    expect(tree!.root.findByType(Input).props.value).toBe('Unpublished outcome');
    expect(alertError).toHaveBeenCalledWith('عملیات انجام نشد', expect.any(DatasetChangedError));
  });

  it.each(['فردا', '۳ روز', '۱ هفته'])('rejects a held %s postponement after restore', async (choice) => {
    const original = current();
    const restore = snapshot();
    await render();
    const postpone = await ask('تعویق', choice);
    await act(async () => restore());
    await invoke(postpone);
    expect(current()).toEqual(original);
    expect(alertError).toHaveBeenCalledWith('عملیات انجام نشد', expect.any(DatasetChangedError));
  });

  it.each([
    { status: 'pending' as const, choice: 'انجام نشد' },
    { status: 'missed' as const, choice: 'دوباره فعال شود' },
  ])('rejects an old $status status callback after same-ID restore', async ({ status, choice }) => {
    t.db.update(followUps).set({ status }).where(eq(followUps.id, current().id)).run();
    const original = current();
    const restore = snapshot();
    await render();
    const change = await askMore(choice);
    await act(async () => restore());
    await invoke(change);
    expect(current()).toEqual(original);
    expect(alertError).toHaveBeenCalledWith('عملیات انجام نشد', expect.any(DatasetChangedError));
  });

  it('rejects an old delete confirmation after restore and a deliberate fresh card remount', async () => {
    const original = current();
    const restore = snapshot();
    await render();
    const remove = await askMore('حذف');
    await act(async () => {
      restore();
      tree!.unmount();
    });
    await render();
    await invoke(remove);
    expect(current()).toEqual(original);
    expect(alertError).toHaveBeenCalledWith('عملیات انجام نشد', expect.any(DatasetChangedError));
    await invoke(await askMore('حذف'));
    expect(current().deletedAt).toBeInstanceOf(Date);
  });

  it('rejects an old reminder retry without reacknowledging the restored task', async () => {
    t.db.update(followUps).set({ reminderAppliedRevision: -1 }).where(eq(followUps.id, current().id)).run();
    const original = current();
    const restore = snapshot();
    await render();
    const retry = action('تلاش مجدد').props.onPress;
    const native = jest.spyOn(notifications, 'scheduleReminder');
    await act(async () => restore());
    await invoke(retry);
    expect(current()).toEqual(original);
    expect(native).not.toHaveBeenCalled();
    expect(alertError).toHaveBeenCalledWith('عملیات انجام نشد', expect.any(DatasetChangedError));
  });

  it('refuses an old phone-call handler after restore instead of dialing the retained contact', async () => {
    const original = current();
    const restore = snapshot();
    await render();
    const call = action('تماس').props.onPress;
    await act(async () => restore());
    await invoke(call);
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(current()).toEqual(original);
    expect(alertError).toHaveBeenCalledWith('عملیات انجام نشد', expect.any(DatasetChangedError));
  });

  it('gives a card mounted late in a retained screen the original scope intent', async () => {
    const original = current();
    const restore = snapshot();
    await render(false);
    await act(async () => {
      restore();
      tree!.update(scoped());
    });
    await invoke(await ask('تعویق', 'فردا'));
    expect(current()).toEqual(original);
    expect(alertError).toHaveBeenCalledWith('عملیات انجام نشد', expect.any(DatasetChangedError));
  });

  it('keeps completion admitted and its actual prompt locked until native reminder removal acknowledges', async () => {
    await render();
    await invoke(action('انجام شد').props.onPress);
    await act(async () => tree!.root.findByType(Input).props.onChangeText('Acknowledged outcome'));
    let acknowledge!: () => void;
    const pending = new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    const native = jest.spyOn(notifications, 'cancelReminderRequired').mockImplementation(() => pending);
    await invoke(button('ثبت').props.onPress);
    expect(native).toHaveBeenCalledTimes(1);
    expect(current()).toMatchObject({ status: 'done', outcome: 'Acknowledged outcome', reminderRevision: 1 });
    let admissionError: unknown;
    try {
      reserveDatasetReplacement().release();
    } catch (error) {
      admissionError = error;
    }
    // Always finish the native stand-in, including a red run of this witness.
    const wasLocked = prompt().props.busy;
    const editable = tree!.root.findByType(Input).props.editable;
    await invoke(button('انصراف').props.onPress);
    await invoke(tree!.root.findByType(Modal).props.onRequestClose);
    const retainedBeforeAck = prompt().props.visible;
    await act(async () => {
      acknowledge();
      await settle();
    });
    expect(admissionError).toBeInstanceOf(DatasetBusyError);
    expect(wasLocked).toBe(true);
    expect(editable).toBe(false);
    expect(retainedBeforeAck).toBe(true);
    expect(prompt().props.visible).toBe(false);
    expect(current()).toMatchObject({ status: 'done', outcome: 'Acknowledged outcome', reminderAppliedRevision: 1 });
    reserveDatasetReplacement().release();
  });

  it('allows deliberate fresh postponement, missed status and reactivation after restore', async () => {
    const originalDue = current().dueAt;
    const restore = snapshot();
    await act(async () => restore());
    await render();
    await invoke(await ask('تعویق', '۳ روز'));
    expect(current().dueAt).toEqual(postponedDueDate(originalDue, 3));
    await invoke(await askMore('انجام نشد'));
    expect(current().status).toBe('missed');
    await act(async () => tree!.update(scoped()));
    await invoke(await askMore('دوباره فعال شود'));
    expect(current().status).toBe('pending');
    expect(alertError).not.toHaveBeenCalled();
  });

  it('allows a fresh phone call and reminder repair after restore without completing the follow-up', async () => {
    t.db.update(followUps).set({ reminderAppliedRevision: -1 }).where(eq(followUps.id, current().id)).run();
    const restore = snapshot();
    await act(async () => restore());
    await render();
    await invoke(action('تماس').props.onPress);
    expect(Linking.openURL).toHaveBeenCalledWith('tel:+12025550123');
    await invoke(action('تلاش مجدد').props.onPress);
    expect(current()).toMatchObject({ status: 'pending', outcome: null, reminderAppliedRevision: 0 });
    expect(alertError).not.toHaveBeenCalled();
  });
});
