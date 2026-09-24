import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { PromptModal } from '@/components/prompt-modal';
import { Button, Input } from '@/components/ui';
import { followUps } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import * as notifications from '@/platform/notifications';
import { useTestDatabase } from '@/test/db-client';
import { resetNotifications } from '@/test/mocks/notifications';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { FollowUpCard } from './follow-up-card';
import { createFollowUp } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicon');
jest.mock('@/components/feedback', () => ({ alertError: jest.fn() }));
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
const current = () => t.db.select().from(followUps).get()!;
async function settle() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
async function render() {
  await act(async () => {
    tree = create(<FollowUpCard followUp={current()} />);
  });
}
const action = (label: string) =>
  tree!.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0]!;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  resetNotifications();
  jest.clearAllMocks();
  const patientId = await createPatient({ firstName: 'Test', lastName: 'Patient' });
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
      tree!.update(<FollowUpCard followUp={current()} />);
    });
    expect(action('تلاش مجدد')).toBeUndefined();
    expect(current().reminderAppliedRevision).toBe(current().reminderRevision);
  });
});
