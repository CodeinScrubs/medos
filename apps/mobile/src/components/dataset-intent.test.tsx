import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { useEffect, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { restoreDatabase } from '@/db/client';
import { tasks } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { createTask } from '@/features/tasks/queries';
import { datasetGeneration, reserveDatasetReplacement, withDatasetWrite } from '@/lib/dataset-write';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { AutosaveField } from './autosave-field';
import { AutosaveScope, useAutosaveScope } from './autosave-scope';
import { useDatasetIntent } from './dataset-intent';
import { Input, Text } from './ui';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: () => {} }));
jest.mock('@/components/ui', () => ({ Button: 'Button', Column: 'Column', Input: 'Input', Text: 'Text' }));

let tree: ReactTestRenderer | undefined;
let t: TestDatabase;
let taskId: string;
let scope: NonNullable<ReturnType<typeof useAutosaveScope>>;
let intent: ReturnType<typeof useDatasetIntent>;
let snapshotCounter = 0;

function CaptureScope() {
  const value = useAutosaveScope()!;
  useEffect(() => {
    scope = value;
  }, [value]);
  return null;
}
function IntentProbe({ expected }: { expected?: number }) {
  const value = useDatasetIntent(expected);
  useEffect(() => {
    intent = value;
  }, [value]);
  return null;
}
function scoped(children?: ReactNode) {
  return (
    <AutosaveScope>
      <CaptureScope />
      {children}
    </AutosaveScope>
  );
}
async function render(children?: ReactNode) {
  await act(async () => {
    tree = create(scoped(children));
  });
}
async function mountLate(children: ReactNode) {
  await act(async () => tree!.update(scoped(children)));
}
function snapshot() {
  const path = `/scope-intent-${++snapshotCounter}.db`;
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
const current = () => t.db.select().from(tasks).where(eq(tasks.id, taskId)).get()!;
const field = () => tree!.root.findByType(Input);
function noteField() {
  return (
    <AutosaveField
      label="Synthetic note"
      initialValue={current().notes}
      onSave={async (notes) => {
        t.db.update(tasks).set({ notes }).where(eq(tasks.id, taskId)).run();
      }}
    />
  );
}

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  taskId = await createTask({ title: 'Synthetic task', notes: 'Restored note' });
  jest.useFakeTimers();
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('dataset intent inherits the mounted screen scope', () => {
  it('gives a late child the original scope generation after a real database replacement', async () => {
    const restore = snapshot();
    const original = datasetGeneration();
    await render();
    const retainedScope = scope;
    await act(async () => restore());
    await mountLate(<IntentProbe />);
    expect(scope).toBe(retainedScope);
    expect(intent).toEqual({ generation: original, stale: true });
  });

  it('honors an explicit generation before the enclosing stale scope and keeps it immutable', async () => {
    const restore = snapshot();
    await render();
    await act(async () => restore());
    const explicit = datasetGeneration();
    await mountLate(<IntentProbe expected={explicit} />);
    expect(intent).toEqual({ generation: explicit, stale: false });
    await act(async () => restore());
    await mountLate(<IntentProbe expected={datasetGeneration()} />);
    expect(intent).toEqual({ generation: explicit, stale: true });
  });

  it('uses a newly mounted scope rather than a retained ancestor for a deliberate fresh intent', async () => {
    const restore = snapshot();
    await render();
    await act(async () => restore());
    const fresh = datasetGeneration();
    await mountLate(
      <AutosaveScope>
        <IntentProbe />
      </AutosaveScope>,
    );
    expect(intent).toEqual({ generation: fresh, stale: false });
    await withDatasetWrite(intent.generation, async () => {
      t.db.update(tasks).set({ notes: 'Fresh scope write' }).where(eq(tasks.id, taskId)).run();
    });
    expect(current().notes).toBe('Fresh scope write');
  });

  it('captures the current generation once when there is no scope', async () => {
    const restore = snapshot();
    const original = datasetGeneration();
    await act(async () => {
      tree = create(<IntentProbe />);
    });
    expect(intent).toEqual({ generation: original, stale: false });
    await act(async () => restore());
    expect(intent).toEqual({ generation: original, stale: true });
  });

  it('retains a late field raw value and refuses direct saver flush against the restored same-ID row', async () => {
    const restore = snapshot();
    await render();
    const register = jest.spyOn(scope.group, 'register');
    await act(async () => restore());
    await mountLate(noteField());
    await act(async () => field().props.onChangeText('Unpublished old-screen note'));
    const saver = register.mock.calls[0]![0];
    let saved: boolean | undefined;
    await act(async () => {
      saved = await saver.flush();
    });
    expect(saved).toBe(false);
    expect(saver.unsaved).toBe(true);
    expect(current().notes).toBe('Restored note');
    expect(field().props.value).toBe('Unpublished old-screen note');
    expect(tree!.root.findAllByType(Text).some((node) => node.props.children.includes('فرم قدیمی است'))).toBe(true);
  });

  it('saves a field mounted in a fresh scope after the same real restore', async () => {
    const restore = snapshot();
    await render();
    await act(async () => {
      restore();
      tree!.unmount();
    });
    await render();
    const register = jest.spyOn(scope.group, 'register');
    await mountLate(noteField());
    await act(async () => field().props.onChangeText('Fresh field note'));
    const saver = register.mock.calls[0]![0];
    let saved: boolean | undefined;
    await act(async () => {
      saved = await saver.flush();
    });
    expect(saved).toBe(true);
    expect(saver.unsaved).toBe(false);
    expect(current().notes).toBe('Fresh field note');
    expect(field().props.value).toBe('Fresh field note');
  });
});
