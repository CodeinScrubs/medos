import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, EmptyState, Input, SectionHeader } from '@/components/ui';
import { vitals } from '@/db/schema';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { recordVital, updateVital, patientVitalsQuery, vitalQuery } from './queries';
import { VitalsTab } from './vitals-tab';
import { createPatient } from '../patients/queries';

let mockReadError: Error | undefined;
let mockRows: unknown[] | undefined;
const mockRetry = jest.fn(() => {
  mockReadError = undefined;
});
// Expose the real form's press callbacks; this is not a native touch test.
jest.mock('react-native', () => {
  const native = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy(native, { get: (target, key) => (key === 'Pressable' ? 'Pressable' : Reflect.get(target, key)) });
});
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[] }) => {
    if (!mockReadError) mockRows = query.all();
    return { data: mockRows, error: mockReadError, retry: mockRetry };
  },
}));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  EmptyState: 'EmptyState',
  Input: 'Input',
  Row: 'Row',
  SectionHeader: 'SectionHeader',
  Text: 'Text',
}));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/quick-date-field', () => ({ QuickDateField: 'QuickDateField' }));
jest.mock('@/components/trend-chart', () => ({ TrendChart: 'TrendChart' }));
jest.mock('@/components/use-now', () => ({ useNow: () => new Date('2026-10-02T08:00:00Z').getTime() }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {} }) }));

let tree: ReactTestRenderer | undefined;
let patientId: string;
let t: TestDatabase;
const input = (label: string) => tree!.root.findAllByType(Input).find((node) => node.props.label === label)!;
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
async function settle() {
  for (let i = 0; i < 16; i++) await Promise.resolve();
}
async function render() {
  await act(async () => {
    tree = create(<VitalsTab patientId={patientId} />);
  });
}
async function startNew() {
  await act(async () => {
    button('اندازه‌گیری تازه').props.onPress();
  });
}
async function startEdit() {
  await act(async () => {
    tree!.root.findAllByType(Pressable)[0]!.props.onPress();
  });
}
async function type(label: string, value: string) {
  await act(async () => {
    input(label).props.onChangeText(value);
  });
}
async function save() {
  await act(async () => {
    button('ثبت').props.onPress();
    await settle();
  });
}

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Vitals' });
  mockReadError = undefined;
  mockRows = undefined;
  mockRetry.mockClear();
  jest.mocked(alertError).mockClear();
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
  tree = undefined;
});

describe('real observation form handlers', () => {
  it('publishes once when the same Save handler is pressed twice before rendering', async () => {
    await render();
    await startNew();
    await type('نبض', '80');
    const submit = button('ثبت').props.onPress;
    await act(async () => {
      submit();
      submit();
      await settle();
    });
    expect(await patientVitalsQuery(patientId)).toHaveLength(1);
  });

  it('reads the latest input when typing and Save happen in the same event turn', async () => {
    await render();
    await startNew();
    const submit = button('ثبت').props.onPress;
    await act(async () => {
      input('نبض').props.onChangeText('81');
      submit();
      await settle();
    });
    expect((await patientVitalsQuery(patientId))[0]?.heartRate).toBe(81);
  });

  it('preserves a newer unrelated reading and untouched exact notes when correcting pulse', async () => {
    const id = await recordVital({ patientId, heartRate: 80, temperature: 37 });
    t.db.update(vitals).set({ notes: '  Synthetic exact note  ' }).where(eq(vitals.id, id)).run();
    await render();
    await startEdit();
    await updateVital(id, { temperature: 38 });
    await type('نبض', '90');
    await save();
    expect((await vitalQuery(id))[0]).toMatchObject({
      heartRate: 90,
      temperature: 38,
      notes: '  Synthetic exact note  ',
    });
  });

  it('refuses a changed pulse conflict and keeps the entered value available', async () => {
    const id = await recordVital({ patientId, heartRate: 80, temperature: 37 });
    await render();
    await startEdit();
    await updateVital(id, { heartRate: 82 });
    await type('نبض', '90');
    await save();
    expect((await vitalQuery(id))[0]?.heartRate).toBe(82);
    expect(input('نبض').props.value).toBe('90');
    expect(alertError).toHaveBeenCalledTimes(1);
  });

  it('does not publish an old parsed time while the visible time is invalid', async () => {
    await render();
    await startNew();
    await type('نبض', '80');
    await act(async () => {
      tree!.root.findByType(QuickDateField).props.onValidityChange(false);
    });
    await save();
    expect(await patientVitalsQuery(patientId)).toHaveLength(0);
    expect(input('نبض').props.value).toBe('80');
  });

  it('uses the last valid measured time when time selection and Save happen in one event turn', async () => {
    await render();
    await startNew();
    await type('نبض', '80');
    const measuredAt = new Date('2026-10-01T08:15:00Z');
    const submit = button('ثبت').props.onPress;
    await act(async () => {
      tree!.root.findByType(QuickDateField).props.onChange(measuredAt);
      submit();
      await settle();
    });
    expect((await patientVitalsQuery(patientId))[0]?.measuredAt).toEqual(measuredAt);
  });

  it('refuses to combine a locally changed BP with a concurrently corrected counterpart', async () => {
    const id = await recordVital({ patientId, systolic: 120, diastolic: 80 });
    await render();
    await startEdit();
    await updateVital(id, { diastolic: 110 });
    await type('فشار (mmHg)', '100/80');
    await save();
    expect((await vitalQuery(id))[0]).toMatchObject({ systolic: 120, diastolic: 110 });
    expect(input('فشار (mmHg)').props.value).toBe('100/80');
    expect(alertError).toHaveBeenCalledTimes(1);
  });

  it('retains edited input across a failed refresh and retry while withholding the stale count', async () => {
    await recordVital({ patientId, heartRate: 80 });
    await render();
    await startEdit();
    await type('نبض', '90');
    mockReadError = new Error('Synthetic refresh failure');
    await act(async () => {
      tree!.update(<VitalsTab patientId={patientId} />);
    });
    expect(input('نبض').props.value).toBe('90');
    expect(
      tree!.root.findAllByType(SectionHeader).find((node) => node.props.title === 'اندازه‌گیری‌ها')?.props.count,
    ).toBeUndefined();
    await act(async () => {
      tree!.root.findByType(ErrorNotice).props.onRetry();
      tree!.update(<VitalsTab patientId={patientId} />);
    });
    expect(input('نبض').props.value).toBe('90');
    expect(
      tree!.root.findAllByType(SectionHeader).find((node) => node.props.title === 'اندازه‌گیری‌ها')?.props.count,
    ).toBe(1);
  });

  it('shows retry without claiming an empty successful result on failed initial reads', async () => {
    mockReadError = new Error('Synthetic read failure');
    await render();
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(0);
    const notice = tree!.root.findByType(ErrorNotice);
    expect(notice.props.onRetry).toBe(mockRetry);
    await act(async () => {
      notice.props.onRetry();
      tree!.update(<VitalsTab patientId={patientId} />);
    });
    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(1);
  });
});
