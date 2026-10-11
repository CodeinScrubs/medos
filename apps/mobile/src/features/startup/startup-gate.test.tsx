import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { labPanels, labValues, patients } from '@/db/schema';
import { patientLabValuesQuery } from '@/features/labs/queries';
import { stamps } from '@/lib/ids';
import { logError } from '@/platform/error-log';
import { databaseRows } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { StartupGate } from './startup-gate';

// The real lab repair, SQL/history and gate run. Other startup stages/native
// services are isolated; this is not full migration/restore or hardware proof.
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/db/startup', () => ({ startDatabase: async () => {} }));
jest.mock('@/features/backup/engine', () => ({ recoverInterruptedRestore: async () => {} }));
jest.mock('@/features/search/reindex', () => ({ reindexSearchIfNeeded: async () => {} }));
jest.mock('@/features/notes/version-queries', () => ({ backfillNoteVersionsIfNeeded: async () => {} }));
jest.mock('@/features/encounters/status', () => ({ reconcileAllPatientStatuses: async () => 0 }));
jest.mock('@/platform/audio', () => ({ prepareAudioForPlayback: async () => {} }));
jest.mock('@/platform/error-log', () => ({ logError: jest.fn() }));
jest.mock('expo-splash-screen', () => ({ hideAsync: async () => {} }));
jest.mock('@/components/ui', () => ({ Text: 'Text' }));
const now = new Date('2026-10-11T09:00:00Z');
let t: TestDatabase, tree: ReactTestRenderer | undefined;
async function render() {
  await act(async () => {
    tree = create(
      <StartupGate>
        <Ready />
      </StartupGate>,
    );
  });
}
function Ready() {
  return <>{'Synthetic app ready'}</>;
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  jest.mocked(logError).mockClear();
  for (const id of ['owner', 'other'])
    t.db
      .insert(patients)
      .values({ id, firstName: 'Synthetic', lastName: id, ...stamps(now) })
      .run();
  for (const id of ['mixed', 'healthy'])
    t.db
      .insert(labPanels)
      .values({ id, patientId: 'owner', source: 'manual', collectedAt: now, ...stamps(now) })
      .run();
  for (const [id, panelId, patientId] of [
    ['sibling', 'mixed', 'owner'],
    ['foreign', 'mixed', 'other'],
    ['healthy', 'healthy', 'owner'],
  ] as const)
    t.db
      .insert(labValues)
      .values({
        id,
        panelId,
        patientId,
        analyte: 'Synthetic analyte',
        value: '<5',
        refLow: 3,
        refHigh: 100,
        flag: 'normal',
        ...stamps(now),
      })
      .run();
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
});
describe('startup with an imported mixed-owner lab panel', () => {
  it('opens healthy records on first and later starts without rewriting the inconsistent panel', async () => {
    const before = databaseRows(t);
    await render();
    expect(tree!.root.findAllByType(Ready)).toHaveLength(1);
    expect(
      patientLabValuesQuery('owner')
        .all()
        .map((r) => r.value.id),
    ).toEqual(['healthy']);
    expect(databaseRows(t).lab_values!.filter((r) => r.panel_id === 'mixed')).toEqual(
      before.lab_values!.filter((r) => r.panel_id === 'mixed'),
    );
    const repaired = databaseRows(t);
    await act(async () => tree!.unmount());
    tree = undefined;
    await render();
    expect(tree!.root.findAllByType(Ready)).toHaveLength(1);
    expect(databaseRows(t)).toEqual(repaired);
    expect(logError).not.toHaveBeenCalled();
  });
  it('still blocks an actual failed SQL repair without partial clinical writes', async () => {
    t.sqlite.exec(
      "CREATE TRIGGER refuse_repair BEFORE UPDATE ON lab_values WHEN OLD.id='healthy' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    const before = databaseRows(t);
    await render();
    expect(tree!.root.findAllByType(Ready)).toHaveLength(0);
    expect(databaseRows(t)).toEqual(before);
    expect(logError).toHaveBeenCalledWith(expect.any(Error), { source: 'startup', fatal: true });
  });
});
