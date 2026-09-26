import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { Text } from '@/components/ui';
import { createOrder, setOrderStatus } from '@/features/kardex/queries';
import { createLabPanel } from '@/features/labs/queries';
import { createNote } from '@/features/notes/queries';
import { recordVital } from '@/features/vitals/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase } from '@/test/sqljs';

import { PatientSnapshot } from './patient-snapshot';
import { createPatient } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
// Rows are read once on mount here; live updates are use-live.test's subject.
jest.mock('expo-sqlite', () => ({ addDatabaseChangeListener: () => ({ remove: () => {} }) }));
const mockRouter = { push: jest.fn(), setParams: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/components/ui', () => ({
  Card: 'Card',
  Column: 'Column',
  Divider: 'Divider',
  Row: 'Row',
  SectionHeader: 'SectionHeader',
  Text: 'Text',
}));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/use-now', () => ({ useNow: () => Date.now() }));

let tree: ReactTestRenderer | undefined;
let patientId: string;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

async function render() {
  await act(async () => {
    tree = create(<PatientSnapshot patientId={patientId} />);
  });
  // useLive reads after mount, and the test database answers asynchronously.
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

function textOf(node: ReactTestInstance): string {
  return node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}

/** The tappable rows (Pressable is memoised, so it is found by what it does rather than its type). */
function rows(): ReactTestInstance[] {
  return tree!.root.findAll((node) => typeof node.type !== 'string' && typeof node.props.onPress === 'function', {
    deep: false,
  });
}

function rowTexts(): string[] {
  return rows().map(textOf);
}

beforeEach(async () => {
  useTestDatabase(await createTestDatabase());
  mockRouter.push.mockClear();
  mockRouter.setParams.mockClear();
  patientId = await createPatient({ firstName: 'Test', lastName: 'Patient', status: 'outpatient' });
});

afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
});

describe('patient at a glance', () => {
  it('shows nothing for a patient with nothing recorded', async () => {
    await render();
    expect(tree!.toJSON()).toBeNull();
  });

  it('reads back the last vitals, the results that need a look, running orders and the last note', async () => {
    await recordVital({ patientId, measuredAt: hoursAgo(2), systolic: 150, diastolic: 90, spo2: 95 });
    await createLabPanel({
      patientId,
      collectedAt: hoursAgo(30),
      source: 'manual',
      values: [{ analyte: 'K', value: '5.9', refLow: 3.5, refHigh: 5.1 }],
    });
    await createLabPanel({
      patientId,
      collectedAt: hoursAgo(3),
      source: 'manual',
      values: [
        { analyte: 'K', value: '4.2', refLow: 3.5, refHigh: 5.1 },
        { analyte: 'Cr', value: '1.9', refLow: 0.6, refHigh: 1.3 },
        { analyte: 'Troponin', value: '0.8' },
      ],
    });
    await createOrder({ patientId, kind: 'drug', name: 'Aspirin' });
    const stopped = await createOrder({ patientId, kind: 'drug', name: 'Ceftriaxone' });
    await setOrderStatus(stopped, 'discontinued');
    await createNote({ patientId, type: 'progress', subjective: 'Better', assessment: 'NSTEMI', plan: 'Echo' });

    await render();
    const [vitals, labs, kardex, note] = rowTexts();

    expect(vitals).toContain('150/90');
    expect(vitals).toContain('95%');
    // This morning's potassium is normal, so yesterday's high one is not news;
    // a result with no range is neither flagged nor called normal.
    expect(labs).toContain('Cr 1.9 H');
    expect(labs).not.toContain('K ');
    expect(labs).not.toContain('Troponin');
    expect(kardex).toContain('Aspirin');
    expect(kardex).not.toContain('Ceftriaxone');
    expect(note).toContain('A: NSTEMI');
    expect(note).toContain('P: Echo');
    expect(note).not.toContain('Better');
  });

  it('says how many results it looked at when none is flagged', async () => {
    await createLabPanel({
      patientId,
      collectedAt: hoursAgo(1),
      source: 'manual',
      values: [
        { analyte: 'Na', value: '138', refLow: 135, refHigh: 145 },
        { analyte: 'Troponin', value: '0.01' },
      ],
    });
    await render();
    expect(rowTexts()).toEqual([expect.stringContaining('آخرین نتیجه‌ی ۲ آزمایش: بدون H یا L')]);
  });

  it('opens the tab or the note a row stands for', async () => {
    await recordVital({ patientId, heartRate: 88 });
    const noteId = await createNote({ patientId, type: 'general', body: 'Called the family' });
    await render();
    const [vitals, note] = rows();

    await act(async () => vitals!.props.onPress());
    expect(mockRouter.setParams).toHaveBeenCalledWith({ tab: 'vitals' });
    await act(async () => note!.props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/patient/[id]/note', params: { id: patientId, noteId } });
    expect(tree!.root.findAllByType(Text).some((t) => textOf(t).includes('Called the family'))).toBe(true);
  });
});
