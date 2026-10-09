import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { alertError, notify } from '@/components/feedback';
import { Button, EmptyState, SectionHeader } from '@/components/ui';
import { auditLog, notes, patients } from '@/db/schema';
import * as captures from '@/features/capture/queries';
import * as noteQueries from '@/features/notes/queries';
import { databaseRows, replacementFailure, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import * as patientQueries from './queries';
import { TrashScreen } from './trash-screen';

const mockListeners = new Set<(event: { tableName: string }) => void>();
const mockReplace = jest.fn();
let mockFocused = true;
jest.mock('expo-sqlite', () => ({
  addDatabaseChangeListener: (listener: (event: { tableName: string }) => void) => {
    mockListeners.add(listener);
    return { remove: () => mockListeners.delete(listener) };
  },
}));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({ isFocused: () => mockFocused }) }));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: () => {} }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  EmptyState: 'EmptyState',
  Row: 'Row',
  Screen: 'Screen',
  SectionHeader: 'SectionHeader',
  Text: 'Text',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ spacing: {} }) }));

let tree: ReactTestRenderer | undefined;
let t: TestDatabase, patientId: string;
async function settle() {
  for (let i = 0; i < 45; i++) await Promise.resolve();
}
async function render() {
  await act(async () => {
    if (tree) tree.update(<TrashScreen />);
    else tree = create(<TrashScreen />);
    await settle();
  });
}
function buttons(label = 'برگرداندن') {
  return tree!.root.findAllByType(Button).filter((n) => n.props.label === label);
}
beforeEach(async () => {
  jest.clearAllMocks();
  mockListeners.clear();
  mockFocused = true;
  t = useTestDatabase(await createTestDatabase());
  patientId = await patientQueries.createPatient({ firstName: 'Synthetic', lastName: 'Trash' });
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  tree = undefined;
  jest.restoreAllMocks();
});

describe('trash reads and actual restore handlers', () => {
  it('does not claim empty after a failed initial read and retries that real query', async () => {
    await patientQueries.deletePatient(patientId);
    const prepare = t.sqlite.prepare.bind(t.sqlite);
    let broken = true;
    jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (broken && sql.includes('from "patients"') && !sql.includes('join')) throw new Error('Synthetic trash read');
      return prepare(sql, params);
    });
    await render();
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(0);
    const notice = tree!.root.findAllByType(ErrorNotice).find((n) => n.props.error)!;
    expect(notice).toBeDefined();
    broken = false;
    await act(async () => {
      notice.props.onRetry();
      await settle();
    });
    expect(buttons()).toHaveLength(1);
  });
  it('withholds an empty result while any initial query is unresolved', async () => {
    const read = patientQueries.deletedPatientsQuery;
    jest.spyOn(patientQueries, 'deletedPatientsQuery').mockImplementation((...args) => {
      const query = read(...args);
      jest.spyOn(query, 'then').mockImplementation(() => new Promise<never>(() => {}));
      return query;
    });
    await render();
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(0);
  });
  it('retains cached rows after a refresh failure but withholds counts and restore', async () => {
    await patientQueries.deletePatient(patientId);
    await render();
    expect(buttons()).toHaveLength(1);
    const prepare = t.sqlite.prepare.bind(t.sqlite);
    let broken = true;
    jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (broken && sql.includes('from "patients"') && !sql.includes('join')) throw new Error('Synthetic refresh');
      return prepare(sql, params);
    });
    await act(async () => {
      for (const listener of mockListeners) listener({ tableName: 'patients' });
      await new Promise((resolve) => setTimeout(resolve, 90));
      await settle();
    });
    expect(buttons()).toHaveLength(1);
    expect(buttons()[0]!.props.disabled).toBe(true);
    expect(tree!.root.findAllByType(SectionHeader).every((n) => n.props.count === undefined)).toBe(true);
    const notice = tree!.root.findAllByType(ErrorNotice).find((n) => n.props.error)!;
    broken = false;
    await act(async () => {
      notice.props.onRetry();
      await settle();
    });
    expect(buttons()[0]!.props.disabled).toBe(false);
  });
  it('reaches items beyond the old silent fifty-row cutoff', async () => {
    for (let i = 0; i < 52; i++) {
      const id = await noteQueries.createNote({ patientId, type: 'general', body: 'Synthetic ' + i });
      await noteQueries.deleteNote(id);
    }
    await render();
    expect(buttons()).toHaveLength(50);
    const more = tree!.root.findAllByType(Button).find((n) => n.props.label.includes('بیشتر'))!;
    expect(more).toBeDefined();
    await act(async () => {
      more.props.onPress();
      await settle();
    });
    expect(buttons()).toHaveLength(52);
  });
  it('rejects an old callback after real same-id dataset replacement and offers an explicit current view', async () => {
    await patientQueries.deletePatient(patientId);
    await render();
    const old = buttons()[0]!.props.onPress;
    await act(async () => snapshotDataset(t)());
    const before = databaseRows(t);
    await act(async () => {
      old();
      await settle();
    });
    expect(databaseRows(t)).toEqual(before);
    expect(buttons()[0]!.props.disabled).toBe(true);
    const open = tree!.root.findAllByType(Button).find((n) => n.props.label === 'باز کردن سطل زبالهٔ جدید')!;
    expect(open).toBeDefined();
    mockFocused = false;
    await act(async () => open.props.onPress());
    expect(mockReplace).not.toHaveBeenCalled();
    mockFocused = true;
    await act(async () => open.props.onPress());
    expect(mockReplace).toHaveBeenCalledWith('/trash');
  });
  it('serializes same-turn presses and holds restore admission through asynchronous acknowledgment', async () => {
    const id = await captures.createCapture({ text: 'Synthetic restore' });
    await captures.discardCapture(id);
    await render();
    const original = captures.restoreCapture;
    let release: () => void = () => {
      throw new Error('Restore not requested');
    };
    const restore = jest.spyOn(captures, 'restoreCapture').mockImplementation(async (...args) => {
      await original(...args);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const press = buttons()[0]!.props.onPress;
    await act(async () => {
      press();
      press();
      await settle();
    });
    expect(restore).toHaveBeenCalledTimes(1);
    expect(replacementFailure()).toBeInstanceOf(Error);
    mockFocused = false;
    await act(async () => {
      release();
      await settle();
    });
    expect(replacementFailure()).toBeNull();
    expect(notify).not.toHaveBeenCalled();
    expect(
      t.db
        .select()
        .from(auditLog)
        .all()
        .filter((r) => r.action === 'capture.restored'),
    ).toHaveLength(1);
  });
  it('keeps a failed restore recoverable and refuses a changed shown tombstone', async () => {
    const id = await noteQueries.createNote({ patientId, type: 'general', body: 'Synthetic kept note' });
    await noteQueries.deleteNote(id);
    await render();
    const press = buttons()[0]!.props.onPress;
    const row = t.db.select().from(notes).where(eq(notes.id, id)).get()!;
    t.db
      .update(notes)
      .set({ updatedAt: new Date(row.updatedAt.getTime() + 1000) })
      .where(eq(notes.id, id))
      .run();
    const before = databaseRows(t);
    await act(async () => {
      press();
      await settle();
    });
    expect(databaseRows(t)).toEqual(before);
    expect(alertError).toHaveBeenCalled();
  });
  it('rolls a refused SQL restore back and re-enables the same row for retry', async () => {
    await patientQueries.deletePatient(patientId);
    await render();
    t.sqlite.exec(
      "CREATE TRIGGER refuse_trash BEFORE UPDATE OF deleted_at ON patients BEGIN SELECT RAISE(ABORT,'Synthetic restore'); END;",
    );
    const before = databaseRows(t);
    await act(async () => {
      buttons()[0]!.props.onPress();
      await settle();
    });
    expect(databaseRows(t)).toEqual(before);
    expect(alertError).toHaveBeenCalled();
    expect(buttons()[0]!.props.disabled).toBe(false);
    t.sqlite.exec('DROP TRIGGER refuse_trash');
    await act(async () => {
      buttons()[0]!.props.onPress();
      await settle();
    });
    expect(t.db.select().from(patients).where(eq(patients.id, patientId)).get()?.deletedAt).toBeNull();
  });
});
