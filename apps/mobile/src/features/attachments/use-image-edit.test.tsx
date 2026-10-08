import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useLayoutEffect, useState } from 'react';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { alertError } from '@/components/feedback';
import { restoreDatabase } from '@/db/client';
import { attachments, imageEditDrafts, imageEditVersions } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { createPatient } from '@/features/patients/queries';
import { reserveDatasetReplacement } from '@/lib/dataset-write';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { imageEditQuery, imageEditSeed, type ImageEditSeed } from './image-edit-queries';
import { addAttachment } from './queries';
import { useImageEdit } from './use-image-edit';

const mockBack = jest.fn();
let mockFocused = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useNavigation: () => ({ isFocused: () => mockFocused }),
}));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: () => {} }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let tree: ReactTestRenderer | undefined, t: TestDatabase, seed: ImageEditSeed;
const models: Record<string, ReturnType<typeof useImageEdit>> = {};
const scopes: Record<string, NonNullable<ReturnType<typeof useAutosaveScope>>> = {};
function Harness({ name }: { name: string }) {
  const scope = useAutosaveScope()!;
  const [initial] = useState(seed);
  const model = useImageEdit(initial, scope.generation);
  useLayoutEffect(() => {
    models[name] = model;
    scopes[name] = scope;
  });
  return null;
}
async function settle() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}
async function invoke(action: () => unknown) {
  await act(async () => {
    await action();
    await settle();
  });
}
async function render(names = ['A']) {
  await act(async () => {
    tree = create(
      <>
        {names.map((name) => (
          <AutosaveScope key={name}>
            <Harness name={name} />
          </AutosaveScope>
        ))}
      </>,
    );
  });
}
const pending = () => ({
  id: 'typing',
  x: 40,
  y: 50,
  width: 300,
  size: 24,
  color: 'red' as const,
  text: '  ضایعه ECG 12.5\nدست چپ  ',
});
beforeEach(async () => {
  jest.useFakeTimers();
  t = useTestDatabase(await createTestDatabase());
  const patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Image Hook' });
  const id = await addAttachment({
    entityType: 'patient',
    entityId: patientId,
    patientId,
    kind: 'clinical_photo',
    relativePath: 'media/synthetic/grid.jpg',
    originalPath: 'media/synthetic/original.png',
    width: 640,
    height: 480,
  });
  seed = imageEditSeed(imageEditQuery(id).get()!);
  mockFocused = true;
  mockBack.mockClear();
  jest.mocked(alertError).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  tree = undefined;
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('image editor lifecycle', () => {
  it('applies and publishes the latest exact text even before a render or autosave timer', async () => {
    await render();
    await invoke(() => {
      models.A!.text(pending());
      return models.A!.save();
    });
    const image = JSON.parse(t.db.select().from(attachments).get()!.imageEditBody!);
    expect(image.marks[0].text).toBe(pending().text);
    expect(t.db.select().from(imageEditVersions).all()).toHaveLength(2);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('retains typed input and blocks leave when draft persistence fails, then retries it', async () => {
    await render();
    t.sqlite.exec(
      "CREATE TRIGGER fail_draft BEFORE INSERT ON image_edit_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await invoke(() => models.A!.text(pending()));
    let allowed = true;
    await invoke(async () => {
      allowed = await scopes.A!.canLeave();
    });
    expect(allowed).toBe(false);
    expect(models.A!.document.pendingText?.text).toBe(pending().text);
    expect(models.A!.state.status).toBe('failed');
    t.sqlite.exec('DROP TRIGGER fail_draft');
    await invoke(async () => {
      allowed = await scopes.A!.canLeave();
    });
    expect(allowed).toBe(true);
    expect(t.db.select().from(imageEditDrafts).get()!.body).toContain('ECG 12.5');
  });
  it('reopens incomplete text from the persisted draft without publishing it', async () => {
    await render();
    await invoke(() => models.A!.text(pending()));
    await invoke(() => scopes.A!.canLeave());
    await invoke(() => tree!.unmount());
    tree = undefined;
    seed = imageEditSeed(imageEditQuery(seed.basis.attachmentId).get()!);
    await render();
    expect(models.A!.document.pendingText).toEqual(pending());
    expect(t.db.select().from(attachments).get()!.imageEditBody).toBeNull();
  });
  it('keeps a completed unfocused editor readable and refuses held mutation callbacks', async () => {
    await render();
    await invoke(() => models.A!.changeImage({ ...seed.document.image, rotation: 1 }));
    const old = models.A!;
    mockFocused = false;
    await invoke(() => old.save());
    expect(mockBack).not.toHaveBeenCalled();
    expect(models.A!.completed).toBe(true);
    const committed = models.A!.document;
    await invoke(() => {
      old.undo();
      old.redo();
      old.text(pending());
      old.applyText();
      old.discard();
      void old.compare();
      void old.resolve('local');
    });
    expect(models.A!.document).toEqual(committed);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(t.db.select().from(imageEditVersions).all()).toHaveLength(2);
    mockFocused = true;
    await invoke(() => models.A!.close());
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('does not let toolbar commands or Save overwrite a held stroke', async () => {
    await render();
    await invoke(() => {
      models.A!.setDrawing(true);
      models.A!.drawImage({
        ...seed.document.image,
        marks: [{ id: 'stroke', kind: 'pen', color: 'red', width: 4, points: [{ x: 10, y: 20 }] }],
      });
      models.A!.undo();
      models.A!.changeImage({ ...seed.document.image, rotation: 1 });
      return models.A!.save();
    });
    expect(models.A!.document.image.rotation).toBe(0);
    expect(models.A!.document.image.marks).toHaveLength(1);
    expect(mockBack).not.toHaveBeenCalled();
    await invoke(() => {
      models.A!.setDrawing(false);
      models.A!.undo();
    });
    expect(models.A!.document.image.marks).toHaveLength(0);
  });
  it('resolves a competing editor conflict without trapping leave or silently losing either branch', async () => {
    await render(['A', 'B']);
    await invoke(() => {
      models.A!.changeImage({ ...seed.document.image, rotation: 1 });
      models.B!.text(pending());
    });
    await invoke(() => scopes.A!.canLeave());
    let allowed = true;
    await invoke(async () => {
      allowed = await scopes.B!.canLeave();
    });
    expect(allowed).toBe(false);
    await invoke(() => models.B!.compare());
    expect(models.B!.comparison!.document.image.rotation).toBe(1);
    await invoke(() => models.B!.resolve('local'));
    expect(models.B!.comparison).toBeNull();
    expect(models.B!.document.pendingText).toEqual(pending());
    await invoke(async () => {
      allowed = await scopes.B!.canLeave();
    });
    expect(allowed).toBe(true);
    await invoke(() => models.B!.save());
    expect(
      t.db
        .select()
        .from(imageEditDrafts)
        .all()
        .filter((row) => row.deletedAt),
    ).toHaveLength(3);
    expect(JSON.parse(t.db.select().from(attachments).get()!.imageEditBody!).marks[0].text).toBe(pending().text);
  });
  it('fences held text-submit/save/discard callbacks after same-id dataset replacement', async () => {
    t.sqlite.exec("VACUUM INTO '/image-original.db'");
    await render();
    await invoke(() => models.A!.text(pending()));
    const old = models.A!;
    await invoke(() => {
      const replacement = reserveDatasetReplacement(),
        trusted = restoreDatabase(replacement);
      try {
        trusted.sqlite.execSync('PRAGMA foreign_keys = OFF');
        trusted.sqlite.execSync("ATTACH DATABASE '/image-original.db' AS restore_src");
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
    await invoke(() => {
      old.applyText();
      old.undo();
      old.text({ ...pending(), text: 'Wrong newer text' });
      return old.save();
    });
    expect(models.A!.document.pendingText).toEqual(pending());
    expect(models.A!.document.image.marks).toHaveLength(0);
    expect(t.db.select().from(imageEditDrafts).all()).toHaveLength(0);
    expect(t.db.select().from(imageEditVersions).all()).toHaveLength(0);
    expect(mockBack).not.toHaveBeenCalled();
    await invoke(() => models.A!.closeStale());
    const confirm = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((button) => button.text === 'بستن فرم')!;
    await invoke(() => confirm.onPress!());
    expect(await scopes.A!.canLeave()).toBe(true);
    expect(t.db.select().from(imageEditDrafts).all()).toHaveLength(0);
  });
});
