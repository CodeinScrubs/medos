import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Button, Input } from '@/components/ui';
import type { Consultation } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { AnswerEditor } from './answer-screen';
import { consultQuery, createConsult, saveConsultAnswerDraft } from './queries';

const mockBack = jest.fn();
let mockExit: () => Promise<boolean>;
jest.mock('expo-router', () => ({ Stack: { Screen: 'StackScreen' }, useRouter: () => ({ back: mockBack }) }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  Input: 'Input',
  Screen: 'Screen',
  Text: 'Text',
}));
jest.mock('@/components/edit-gate', () => ({ EditGate: 'EditGate' }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn() }));
jest.mock('@/components/use-save-before-leave', () => ({
  useSaveBeforeLeave: (_unsaved: boolean, flush: () => Promise<boolean>) => {
    mockExit = flush;
  },
}));
jest.mock('@/db/use-live', () => ({ useLive: () => ({ data: [], error: undefined }) }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let initial: Consultation;
let tree: ReactTestRenderer;
const input = (label: string) => tree.root.findAllByType(Input).find((node) => node.props.label === label)!;
const button = (label: string) => tree.root.findAllByType(Button).find((node) => node.props.label === label)!;
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
async function mount(row: Consultation) {
  await act(async () => {
    tree = create(<AnswerEditor initial={row} onReload={() => {}} />);
  });
}

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  const patientId = await createPatient({ firstName: 'Test', lastName: 'Patient', status: 'outpatient' });
  const id = await createConsult({ patientId, reason: 'Question' });
  initial = (await consultQuery(id))[0]!;
  mockBack.mockClear();
  jest.useFakeTimers();
});
afterEach(async () => {
  if (tree)
    await act(async () => {
      tree.unmount();
      await settle();
    });
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('consult answer editor with SQLite', () => {
  it('flushes both fields on exit without publishing, then reopens the exact draft', async () => {
    await mount(initial);
    await act(async () => {
      input('پاسخ').props.onChangeText('Draft A\nExact words');
      input('دستور پیگیری').props.onChangeText('Later');
      expect(await mockExit()).toBe(true);
    });
    const stored = (await consultQuery(initial.id))[0]!;
    expect(stored).toMatchObject({
      draftResponse: 'Draft A\nExact words',
      draftInstruction: 'Later',
      status: 'pending',
      response: null,
    });
    await act(async () => tree.unmount());
    await mount(stored);
    expect(input('پاسخ').props.value).toBe('Draft A\nExact words');
    expect(input('دستور پیگیری').props.value).toBe('Later');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('blocks publish and exit on a failed save, keeps text visible, and retries the latest text once', async () => {
    await mount(initial);
    t.sqlite.exec(
      "CREATE TRIGGER fail_draft BEFORE UPDATE ON consultations BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await act(async () => {
      input('پاسخ').props.onChangeText('Latest reply');
      button('ثبت پاسخ').props.onPress();
      button('ثبت پاسخ').props.onPress();
      await settle();
    });
    expect(input('پاسخ').props.value).toBe('Latest reply');
    expect(mockBack).not.toHaveBeenCalled();
    await act(async () => {
      expect(await mockExit()).toBe(false);
    });
    expect((await consultQuery(initial.id))[0]?.status).toBe('pending');
    t.sqlite.exec('DROP TRIGGER fail_draft');
    await act(async () => {
      button('ثبت پاسخ').props.onPress();
      await settle();
    });
    expect((await consultQuery(initial.id))[0]).toMatchObject({
      response: 'Latest reply',
      status: 'answered',
      draftResponse: '',
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('requires choosing the displayed stored revision before replacing a conflicting draft', async () => {
    await mount(initial);
    await saveConsultAnswerDraft(initial.id, { response: 'Other editor', instruction: 'Other instruction' }, 0);
    await act(async () => {
      input('پاسخ').props.onChangeText('My reply');
      expect(await mockExit()).toBe(false);
    });
    expect(input('پاسخ').props.value).toBe('My reply');
    expect((await consultQuery(initial.id))[0]?.draftResponse).toBe('Other editor');
    await act(async () => {
      button('مقایسه با نسخهٔ ذخیره‌شده').props.onPress();
      await settle();
    });
    // Another change after the comparison must not be overwritten by that stale approval.
    await saveConsultAnswerDraft(initial.id, { response: 'Newer remote reply', instruction: '' }, 1);
    await act(async () => {
      button('ذخیرهٔ نوشتهٔ من به‌جای این نسخه').props.onPress();
      await settle();
    });
    expect((await consultQuery(initial.id))[0]?.draftResponse).toBe('Newer remote reply');
    expect(input('پاسخ').props.value).toBe('My reply');
    await act(async () => {
      button('مقایسه با نسخهٔ ذخیره‌شده').props.onPress();
      await settle();
    });
    await act(async () => {
      button('ذخیرهٔ نوشتهٔ من به‌جای این نسخه').props.onPress();
      await settle();
    });
    expect((await consultQuery(initial.id))[0]).toMatchObject({ draftResponse: 'My reply', status: 'pending' });
    expect(mockBack).not.toHaveBeenCalled();
  });
});
