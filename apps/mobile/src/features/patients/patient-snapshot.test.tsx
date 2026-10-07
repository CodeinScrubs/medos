import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { Text } from '@/components/ui';
import { tablesOf } from '@/db/query-tables';
import { encounters } from '@/db/schema';
import { openEncounter } from '@/features/encounters/queries';
import { createOrder, patientCurrentOrdersQuery, setOrderStatus } from '@/features/kardex/queries';
import { createLabPanel } from '@/features/labs/queries';
import { createNote } from '@/features/notes/queries';
import { recordVital } from '@/features/vitals/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { PatientSnapshot } from './patient-snapshot';
import { createPatient } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
// Native events are injected explicitly; the real useLive hook and SQL run here.
const mockListeners = new Set<(event: { tableName: string }) => void>();
jest.mock('expo-sqlite', () => ({
  addDatabaseChangeListener: (listener: (event: { tableName: string }) => void) => {
    mockListeners.add(listener);
    return { remove: () => mockListeners.delete(listener) };
  },
}));
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
let database: TestDatabase;
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
  database = useTestDatabase(await createTestDatabase());
  mockListeners.clear();
  mockRouter.push.mockClear();
  mockRouter.setParams.mockClear();
  patientId = await createPatient({ firstName: 'Test', lastName: 'Patient', status: 'outpatient' });
});

afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
});

describe('patient at a glance', () => {
  it('reads current-episode and standing orders together without including an older or foreign episode', async () => {
    await createOrder({ patientId, kind: 'drug', name: 'Synthetic standing order' });
    await openEncounter({ patientId, kind: 'admission', admittedAt: hoursAgo(48) });
    await createOrder({ patientId, kind: 'drug', name: 'Synthetic prior episode' });
    await openEncounter({ patientId, kind: 'admission', admittedAt: hoursAgo(2) });
    await createOrder({ patientId, kind: 'drug', name: 'Synthetic current episode' });
    const other = await createPatient({ firstName: 'Other', lastName: 'Synthetic' });
    await openEncounter({ patientId: other, kind: 'admission' });
    await createOrder({ patientId: other, kind: 'drug', name: 'Synthetic foreign episode' });
    await render();
    const kardex = rowTexts().find((row) => row.includes('کاردکس'))!;
    expect(kardex).toContain('Synthetic standing order');
    expect(kardex).toContain('Synthetic current episode');
    expect(kardex).not.toContain('Synthetic prior episode');
    expect(kardex).not.toContain('Synthetic foreign episode');
  });

  it('preserves latest-closed-episode fallback while excluding deleted encounters', async () => {
    const prior = await openEncounter({ patientId, kind: 'admission', admittedAt: hoursAgo(48) });
    await createOrder({ patientId, kind: 'drug', name: 'Synthetic prior episode' });
    const recent = await openEncounter({ patientId, kind: 'admission', admittedAt: hoursAgo(2) });
    await createOrder({ patientId, kind: 'drug', name: 'Synthetic latest closed episode' });
    // Explicit fixtures for an imported closed episode and a mistaken deletion.
    database.db.update(encounters).set({ isActive: false }).where(eq(encounters.id, recent)).run();
    expect((await patientCurrentOrdersQuery(patientId)).map((order) => order.name)).toEqual([
      'Synthetic latest closed episode',
    ]);
    database.db.update(encounters).set({ deletedAt: new Date() }).where(eq(encounters.id, recent)).run();
    expect((await patientCurrentOrdersQuery(patientId)).map((order) => order.encounterId)).toEqual([prior]);
  });

  it('refreshes current order ownership on an encounter event without relying on an order event', async () => {
    await openEncounter({ patientId, kind: 'admission', admittedAt: hoursAgo(48) });
    await createOrder({ patientId, kind: 'drug', name: 'Synthetic prior episode' });
    await render();
    expect(rowTexts()[0]).toContain('Synthetic prior episode');
    await openEncounter({ patientId, kind: 'admission', admittedAt: hoursAgo(2) });
    await createOrder({ patientId, kind: 'drug', name: 'Synthetic current episode' });
    await act(async () => {
      mockListeners.forEach((listener) => listener({ tableName: 'encounters' }));
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(rowTexts()[0]).toContain('Synthetic current episode');
    expect(rowTexts()[0]).not.toContain('Synthetic prior episode');
    expect(tablesOf(patientCurrentOrdersQuery(patientId))).toEqual(['orders', 'encounters']);
  });

  it('shows the recorded unit beside a flagged laboratory value', async () => {
    await createLabPanel({
      patientId,
      collectedAt: hoursAgo(1),
      source: 'manual',
      values: [{ analyte: 'SyntheticUnits', value: '3.0', unit: 'mg/dL', refLow: 0, refHigh: 1 }],
    });
    await render();
    expect(rowTexts()[0]).toContain('SyntheticUnits');
    expect(rowTexts()[0]).toContain('mg/dL');
  });
  it('makes a missing laboratory unit explicit without guessing one', async () => {
    await createLabPanel({
      patientId,
      collectedAt: hoursAgo(1),
      source: 'manual',
      values: [{ analyte: 'SyntheticNoUnit', value: '3', refLow: 0, refHigh: 1 }],
    });
    await render();
    expect(rowTexts()[0]).toContain('واحد؟');
    expect(rowTexts()[0]).not.toContain('mg/dL');
  });
  it('shows the age of an older flagged result when a different analyte has a newer sample', async () => {
    await createLabPanel({
      patientId,
      collectedAt: hoursAgo(48),
      source: 'manual',
      values: [{ analyte: 'SyntheticOlder', value: '3', unit: 'mg/dL', refLow: 0, refHigh: 1 }],
    });
    await createLabPanel({
      patientId,
      collectedAt: hoursAgo(1),
      source: 'manual',
      values: [{ analyte: 'SyntheticRecent', value: '5', unit: 'mmol/L', refLow: 0, refHigh: 1 }],
    });
    await render();
    expect(rowTexts()[0]).toContain('پریروز');
  });
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
