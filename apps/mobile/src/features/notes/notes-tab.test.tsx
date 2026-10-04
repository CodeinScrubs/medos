import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, type ReactNode } from 'react';
import { Alert, Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { alertError } from '@/components/feedback';
import { restoreDatabase } from '@/db/client';
import { attachments, auditLog, noteDrafts, noteVersions, notes } from '@/db/schema';
import { addAttachment } from '@/features/attachments/queries';
import { importTables } from '@/features/backup/import';
import { createPatient } from '@/features/patients/queries';
import {
  DatasetBusyError,
  DatasetChangedError,
  datasetGeneration,
  reserveDatasetReplacement,
} from '@/lib/dataset-write';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { writeNoteDraft } from './draft-queries';
import { NotesTab } from './notes-tab';
import * as queries from './queries';
import { noteVersionsQuery } from './version-queries';

jest.mock('react-native', () => {
  const native = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy(native, {
    get: (target, key) => (key === 'Pressable' ? 'Pressable' : Reflect.get(target, key)),
  });
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicon');
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[] }) => ({ data: query.all(), retry: jest.fn() }),
}));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: jest.fn() }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/ui', () => ({
  Badge: 'Badge',
  Button: 'Button',
  Card: 'Card',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  EmptyState: 'EmptyState',
  Row: 'Row',
  Text: 'Text',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {} }) }));

let t: TestDatabase;
let patientId: string;
let noteId: string;
let tree: ReactTestRenderer | undefined;
let mountedScope: ReturnType<typeof useAutosaveScope>;
let snapshotCounter = 0;

function CaptureScope() {
  const scope = useAutosaveScope();
  useEffect(() => {
    mountedScope = scope;
  }, [scope]);
  return null;
}
async function settle() {
  for (let i = 0; i < 24; i++) await Promise.resolve();
}
async function render(child: ReactNode = <NotesTab patientId={patientId} />) {
  const node = (
    <AutosaveScope>
      <CaptureScope />
      {child}
    </AutosaveScope>
  );
  await act(async () => {
    if (tree) tree.update(node);
    else tree = create(node);
  });
}
async function invoke(work: () => unknown) {
  await act(async () => {
    await work();
    await settle();
  });
}
async function menu() {
  await invoke(() =>
    tree!.root
      .findAllByType(Pressable)
      .find((node) => node.props.onLongPress)!
      .props.onLongPress(),
  );
}
function confirmation(label: string) {
  const dialogs = jest.mocked(Alert.alert).mock.calls;
  const action = dialogs.at(-1)?.[2]?.find((item) => item.text === label)?.onPress;
  expect(action).toBeDefined();
  return action!;
}
async function finalDelete() {
  await menu();
  await invoke(confirmation('حذف'));
  return confirmation('حذف');
}
function tracked() {
  return {
    notes: t.db.select().from(notes).all(),
    versions: t.db.select().from(noteVersions).all(),
    drafts: t.db.select().from(noteDrafts).all(),
    media: t.db.select().from(attachments).all(),
    audit: t.db.select().from(auditLog).all(),
  };
}
function snapshot() {
  const path = `/note-card-intent-${++snapshotCounter}.db`;
  t.sqlite.exec(`VACUUM INTO '${path}'`);
  return async () => {
    await act(async () => {
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
    });
  };
}

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Note' });
  noteId = await queries.createNote({
    patientId,
    type: 'progress',
    title: 'Synthetic note',
    subjective: 'Synthetic observation',
    plan: 'Synthetic plan',
    noteDate: new Date(2025, 0, 1, 12),
  });
  await writeNoteDraft(
    'synthetic-note-draft',
    { patientId, noteId },
    {
      type: 'progress',
      title: null,
      body: 'Synthetic unsaved text',
      subjective: null,
      objective: null,
      assessment: null,
      plan: null,
      noteDate: new Date(2025, 0, 1, 12),
      doctorId: null,
      specialty: null,
      isPinned: false,
      isDraft: false,
      voices: [],
    },
  );
  await addAttachment({
    entityType: 'note',
    entityId: noteId,
    patientId,
    kind: 'voice',
    relativePath: 'media/synthetic/note.m4a',
    durationMs: 1000,
  });
  mountedScope = null;
  jest.mocked(alertError).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});

describe('mounted note card mutations retain their dataset identity', () => {
  it.each([false, true])('rejects a held pin action after a same-ID restore (pinned: %s)', async (pinned) => {
    if (pinned) await queries.setNotePinned(noteId, true);
    const restore = snapshot();
    const before = tracked();
    await render();
    await menu();
    const old = confirmation(pinned ? 'برداشتن سنجاق' : 'سنجاق کردن');

    await restore();
    expect(tracked()).toEqual(before);
    await invoke(old);

    expect(tracked()).toEqual(before);
    expect(alertError).toHaveBeenCalledWith('تغییر ثبت نشد', expect.any(DatasetChangedError));
  });

  it('rejects a final delete confirmation retained across a same-ID restore', async () => {
    const restore = snapshot();
    const before = tracked();
    await render();
    const old = await finalDelete();

    await restore();
    expect(tracked()).toEqual(before);
    await invoke(old);

    expect(tracked()).toEqual(before);
    expect(alertError).toHaveBeenCalledWith('حذف نشد', expect.any(DatasetChangedError));
  });

  it('keeps the old identity when the nested delete dialog opens only after restore', async () => {
    const restore = snapshot();
    const before = tracked();
    await render();
    await menu();
    const openDelete = confirmation('حذف');

    await restore();
    await invoke(openDelete);
    await invoke(confirmation('حذف'));

    expect(tracked()).toEqual(before);
    expect(alertError).toHaveBeenCalledWith('حذف نشد', expect.any(DatasetChangedError));
  });

  it.each(['pin', 'delete'] as const)('rejects a late-mounted card in the retained old scope: %s', async (action) => {
    const restore = snapshot();
    const before = tracked();
    await render(null);
    const originalScope = mountedScope!;
    const originalGeneration = originalScope.generation;

    await restore();
    expect(datasetGeneration()).not.toBe(originalGeneration);
    await render();
    expect(mountedScope).toBe(originalScope);
    expect(mountedScope!.generation).toBe(originalGeneration);
    if (action === 'pin') {
      await menu();
      await invoke(confirmation('سنجاق کردن'));
    } else {
      await invoke(await finalDelete());
    }

    expect(tracked()).toEqual(before);
    expect(alertError).toHaveBeenCalledWith(
      action === 'pin' ? 'تغییر ثبت نشد' : 'حذف نشد',
      expect.any(DatasetChangedError),
    );
  });

  it.each(['pin', 'delete'] as const)(
    'holds admission after real SQL commits until acknowledgment: %s',
    async (action) => {
      let acknowledge!: () => void;
      const pending = new Promise<void>((resolve) => {
        acknowledge = resolve;
      });
      let committed!: () => void;
      const entered = new Promise<void>((resolve) => {
        committed = resolve;
      });
      if (action === 'pin') {
        const actual = queries.setNotePinned;
        jest.spyOn(queries, 'setNotePinned').mockImplementationOnce(async (...args) => {
          await actual(...args);
          committed();
          await pending;
        });
      } else {
        const actual = queries.deleteNote;
        jest.spyOn(queries, 'deleteNote').mockImplementationOnce(async (...args) => {
          await actual(...args);
          committed();
          await pending;
        });
      }
      await render();
      try {
        if (action === 'pin') {
          await menu();
          await invoke(confirmation('سنجاق کردن'));
        } else {
          await invoke(await finalDelete());
        }
        await entered;
        const row = t.db.select().from(notes).get()!;
        if (action === 'pin') {
          expect(row.isPinned).toBe(true);
          expect((await noteVersionsQuery(noteId)).map((version) => version.isPinned)).toEqual([true, false]);
        } else {
          expect(row.deletedAt).not.toBeNull();
          expect(
            t.db
              .select()
              .from(auditLog)
              .all()
              .some((entry) => entry.action === 'note.deleted'),
          ).toBe(true);
        }
        // Release even if the unfenced baseline admits replacement: do not poison the next test.
        expect(() => reserveDatasetReplacement().release()).toThrow(DatasetBusyError);
      } finally {
        await invoke(acknowledge);
      }
      expect(() => reserveDatasetReplacement().release()).not.toThrow();
      expect(alertError).not.toHaveBeenCalled();
    },
  );

  it('pins and unpins a fresh card with exact history and unchanged draft/media', async () => {
    const before = tracked();
    await render();
    await menu();
    await invoke(confirmation('سنجاق کردن'));
    expect(queries.noteQuery(noteId).get()?.isPinned).toBe(true);

    await render();
    await menu();
    await invoke(confirmation('برداشتن سنجاق'));

    expect((await noteVersionsQuery(noteId)).map((version) => version.isPinned)).toEqual([false, true, false]);
    const after = tracked();
    expect(after.notes[0]).toEqual({ ...before.notes[0], updatedAt: expect.any(Date) });
    expect(after.drafts).toEqual(before.drafts);
    expect(after.media).toEqual(before.media);
    expect(after.audit).toEqual(before.audit);
    expect(alertError).not.toHaveBeenCalled();
  });

  it('soft-deletes a fresh card without removing its history, draft or media', async () => {
    const before = tracked();
    await render();
    await invoke(await finalDelete());

    const after = tracked();
    expect(after.notes[0]).toEqual({
      ...before.notes[0],
      updatedAt: expect.any(Date),
      deletedAt: expect.any(Date),
    });
    expect(queries.patientNotesQuery(patientId).all()).toHaveLength(0);
    expect((await queries.deletedNotesQuery())[0]?.note.id).toBe(noteId);
    expect(after.versions).toEqual(before.versions);
    expect(after.drafts).toEqual(before.drafts);
    expect(after.media).toEqual(before.media);
    expect(after.audit.filter((entry) => entry.entityId === noteId).map((entry) => entry.action)).toEqual([
      'note.deleted',
    ]);
    expect(alertError).not.toHaveBeenCalled();
  });
});
