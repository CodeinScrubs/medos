import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Button, Input } from '@/components/ui';
import type { ConsultRequestDraft } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { SaveGroup } from '@/lib/save-before-leave';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { openConsultsQuery } from './queries';
import { requestDraftQuery, saveRequestDraft } from './request-drafts';
import { RequestDraftEditor } from './request-editor';

let mockScope: { group: SaveGroup };
jest.mock('@/components/autosave-scope', () => ({ useAutosaveScope: () => mockScope }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  Input: 'Input',
  Row: 'Row',
  Text: 'Text',
}));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({
  alertError: jest.fn(),
  notify: jest.requireActual<typeof import('@/components/feedback')>('@/components/feedback').notify,
}));
jest.mock('@/db/use-live', () => ({ useLive: () => ({ data: [], error: undefined }) }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let patientId: string;
let tree: ReactTestRenderer;
const reset = jest.fn<(draft: ConsultRequestDraft | null) => void>();
const input = (placeholder: string) =>
  tree.root.findAllByType(Input).find((node) => node.props.placeholder === placeholder)!;
const button = (label: string) => tree.root.findAllByType(Button).find((node) => node.props.label === label)!;
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
async function mount(initial: ConsultRequestDraft | null = null) {
  await act(async () => {
    tree = create(<RequestDraftEditor initial={initial} patientId={patientId} onReset={reset} />);
  });
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Test', lastName: 'Patient', status: 'outpatient' });
  mockScope = { group: new SaveGroup() };
  reset.mockClear();
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

describe('consult request editor recovery', () => {
  it('flushes both fields before switching tabs and recovers them without publishing', async () => {
    await mount();
    const leave = jest.fn<() => void>();
    await act(async () => {
      input('سرویس').props.onChangeText('Service');
      input('سؤال کانسالت').props.onChangeText('Exact question');
      expect(await mockScope.group.perform(leave)).toBe('done');
    });
    expect(leave).toHaveBeenCalledTimes(1);
    expect(await openConsultsQuery()).toHaveLength(0);
    const saved = (await requestDraftQuery(patientId))[0]!;
    await act(async () => tree.unmount());
    await mount(saved);
    expect(input('سرویس').props.value).toBe('Service');
    expect(input('سؤال کانسالت').props.value).toBe('Exact question');
  });

  it('keeps text and blocks departure on failed save, then publishes once on retry', async () => {
    await mount();
    const leave = jest.fn<() => void>();
    t.sqlite.exec(
      "CREATE TRIGGER fail_request BEFORE INSERT ON consult_request_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await act(async () => {
      input('سؤال کانسالت').props.onChangeText('Keep question');
      expect(await mockScope.group.perform(leave)).toBe('unsaved');
      button('ثبت کانسالت').props.onPress();
      await settle();
    });
    expect(input('سؤال کانسالت').props.value).toBe('Keep question');
    expect(leave).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(await openConsultsQuery()).toHaveLength(0);
    t.sqlite.exec('DROP TRIGGER fail_request');
    await act(async () => {
      button('ثبت کانسالت').props.onPress();
      button('ثبت کانسالت').props.onPress();
      await settle();
    });
    expect(await openConsultsQuery()).toHaveLength(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('requires comparison with the actual stored version before replacing conflicting text', async () => {
    await mount();
    await saveRequestDraft('other', patientId, { specialty: 'Other', reason: 'Stored' }, 0);
    await act(async () => {
      input('سؤال کانسالت').props.onChangeText('Local');
      expect(await mockScope.group.flush()).toBe(false);
    });
    await act(async () => {
      button('بررسی پیش‌نویس ذخیره‌شده').props.onPress();
      await settle();
    });
    await saveRequestDraft('other', patientId, { specialty: 'Other', reason: 'Newer' }, 1);
    await act(async () => {
      button('نگه‌داشتن نوشتهٔ من').props.onPress();
      await settle();
    });
    expect((await requestDraftQuery(patientId))[0]?.reason).toBe('Newer');
    expect(input('سؤال کانسالت').props.value).toBe('Local');
    await act(async () => {
      button('بررسی پیش‌نویس ذخیره‌شده').props.onPress();
      await settle();
    });
    await act(async () => {
      button('نگه‌داشتن نوشتهٔ من').props.onPress();
      await settle();
    });
    expect((await requestDraftQuery(patientId))[0]?.reason).toBe('Local');
    expect(await openConsultsQuery()).toHaveLength(0);
  });
});
