import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { Button, Text } from '@/components/ui';
import { clinicalVersions, labPanels } from '@/db/schema';
import { clinicalSnapshot, encodeClinicalSnapshot } from '@/lib/clinical-history';
import { stamps } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { ClinicalHistoryPanel } from './clinical-history-panel';
import { createPatientInTransaction, updatePatientInTransaction } from './queries';

const mockListeners = new Set<(event: { tableName: string }) => void>();
jest.mock('expo-sqlite', () => ({
  addDatabaseChangeListener: (listener: (event: { tableName: string }) => void) => {
    mockListeners.add(listener);
    return { remove: () => mockListeners.delete(listener) };
  },
}));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  Row: 'Row',
  EmptyState: 'EmptyState',
  Text: 'Text',
}));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
let t: TestDatabase, patientId: string, tree: ReactTestRenderer | undefined;
const at = new Date('2026-10-11T09:00:00Z');
async function settle() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
async function render(stale = false) {
  await act(async () => {
    const app = <ClinicalHistoryPanel patientId={patientId} stale={stale} />;
    if (tree) tree.update(app);
    else tree = create(app);
    await settle();
  });
}
const buttons = (label: string) => tree!.root.findAllByType(Button).filter((row) => row.props.label === label);
const text = () =>
  tree!.root
    .findAllByType(Text)
    .map((row) => row.props.children)
    .flat()
    .join(' ');
async function press(row: ReactTestInstance) {
  await act(async () => {
    row.props.onPress();
    await settle();
  });
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  mockListeners.clear();
  patientId = t.db.transaction((tx) =>
    createPatientInTransaction(tx, { firstName: 'Synthetic', lastName: 'History', allergies: 'Before\n  ' }, at),
  );
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});

describe('read-only corrections inside the patient timeline', () => {
  it('paginates bounded rows, displays an exact before/after clear and preserves Latin clinical values', async () => {
    for (let i = 0; i < 43; i++)
      t.db.transaction((tx) => updatePatientInTransaction(tx, patientId, { summary: `Summary${i}` }, at));
    t.db.transaction((tx) => updatePatientInTransaction(tx, patientId, { allergies: null, ageYears: 25 }, at));
    await render();
    expect(buttons('دیدن تغییرات')).toHaveLength(20);
    await press(buttons('دیدن تغییرات')[0]!);
    expect(text()).toContain('Before\n  ');
    expect(text()).toContain('خالی');
    expect(tree!.root.findAllByType(Text).some((row) => row.props.children === '25' && row.props.numeric)).toBe(true);
    await press(buttons('قدیمی‌تر')[0]!);
    expect(buttons('دیدن تغییرات')).toHaveLength(20);
    await press(buttons('قدیمی‌تر')[0]!);
    expect(buttons('دیدن تغییرات')).toHaveLength(5);
    await press(buttons('جدیدتر')[0]!);
    expect(buttons('دیدن تغییرات')).toHaveLength(20);
  });
  it('withholds clinical interpretation of a misowned document while retaining its exact raw text', async () => {
    const body = encodeClinicalSnapshot(
      clinicalSnapshot('diagnosis', { id: 'foreign', patientId: 'foreign-patient', title: 'Must not mix patients' }),
    );
    t.db
      .insert(clinicalVersions)
      .values({
        id: 'bad',
        patientId,
        kind: 'diagnosis',
        recordId: 'local',
        sequence: 1,
        reason: 'baseline',
        recordedAt: new Date(at.getTime() + 1),
        body,
        ...stamps(at),
      })
      .run();
    await render();
    expect(text()).not.toContain('Must not mix patients');
    await press(buttons('دیدن تغییرات')[0]!);
    expect(text()).toContain('مالکیت');
    expect(text()).not.toContain('Must not mix patients');
    await press(buttons('متن کامل نسخه')[0]!);
    expect(text()).toContain(body);
    expect(t.db.select().from(clinicalVersions).where(eq(clinicalVersions.id, 'bad')).get()!.body).toBe(body);
  });
  it('keeps retained rows after failure, disables expansion/paging and provides real retry', async () => {
    for (let i = 0; i < 23; i++)
      t.db.transaction((tx) => updatePatientInTransaction(tx, patientId, { summary: `Summary${i}` }, at));
    await render();
    const prepare = t.sqlite.prepare.bind(t.sqlite);
    let broken = true;
    jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (broken && sql.includes('from "clinical_versions"')) throw new Error('Synthetic history read');
      return prepare(sql, params);
    });
    await act(async () => {
      for (const listener of mockListeners) listener({ tableName: 'clinical_versions' });
      await new Promise((resolve) => setTimeout(resolve, 90));
      await settle();
    });
    expect(buttons('دیدن تغییرات')).toHaveLength(20);
    expect(buttons('دیدن تغییرات').every((row) => row.props.disabled)).toBe(true);
    expect(buttons('قدیمی‌تر')[0]!.props.disabled).toBe(true);
    broken = false;
    await act(async () => {
      tree!.root
        .findAllByType(ErrorNotice)
        .find((row) => row.props.error)!
        .props.onRetry();
      await settle();
    });
    expect(buttons('دیدن تغییرات')[0]!.props.disabled).toBe(false);
  });
  it('does not read/display newly replaced data through a stale patient timeline', async () => {
    await render();
    await render(true);
    expect(buttons('دیدن تغییرات')).toHaveLength(0);
    expect(text()).toContain('اطلاعات جایگزین شده');
  });
  it('bounds large lab value rendering independently of the metadata page', async () => {
    const id = 'large-lab';
    t.db
      .insert(labPanels)
      .values({ id, patientId, source: 'manual', collectedAt: at, ...stamps(at) })
      .run();
    const snapshot = clinicalSnapshot(
      'lab',
      { id, patientId },
      Array.from({ length: 57 }, (_, i) => ({
        id: `v${i}`,
        patientId,
        panelId: id,
        analyte: `Marker${i}`,
        value: String(i),
        unit: null,
      })),
    );
    t.db
      .insert(clinicalVersions)
      .values({
        id: 'large-version',
        patientId,
        kind: 'lab',
        recordId: id,
        sequence: 1,
        reason: 'created',
        recordedAt: new Date(at.getTime() + 1),
        body: encodeClinicalSnapshot(snapshot),
        ...stamps(at),
      })
      .run();
    await render();
    await press(buttons('دیدن تغییرات')[0]!);
    expect(text()).toContain('Marker0');
    expect(text()).toContain('Marker19');
    expect(text()).not.toContain('Marker20');
    await press(buttons('نتایج بعدی')[0]!);
    expect(text()).toContain('Marker20');
    expect(text()).not.toContain('Marker0');
    await press(buttons('نتایج بعدی')[0]!);
    expect(text()).toContain('Marker56');
    expect(buttons('نتایج بعدی')).toHaveLength(0);
  });
});
