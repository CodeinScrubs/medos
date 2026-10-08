import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AutosaveScope } from '@/components/autosave-scope';
import { alertError } from '@/components/feedback';
import { PromptModal } from '@/components/prompt-modal';
import { Button, IconButton, Input } from '@/components/ui';
import { restoreDatabase } from '@/db/client';
import { attachmentCaptionDrafts, attachments } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { createPatient } from '@/features/patients/queries';
import { DatasetBusyError, DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { decodeCaption } from './caption-draft';
import * as captionQueries from './caption-queries';
import { MediaViewerScreen } from './media-viewer-screen';
import * as queries from './queries';

const mockBack = jest.fn();
let mockParams: { attachmentId: string };
let mockFocused = true;
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useNavigation: () => ({ isFocused: () => mockFocused }),
}));
jest.mock('./image-export', () => ({ useImageExport: () => ({ render: jest.fn(), scene: null, busy: false }) }));
jest.mock('@/components/annotated-image', () => ({ AnnotatedImage: 'AnnotatedImage' }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-status-bar', () => ({ StatusBar: 'StatusBar' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('react-native-keyboard-controller', () => ({ KeyboardController: { isVisible: () => false } }));
jest.mock('@/components/zoomable-image', () => ({ ZoomableImage: 'ZoomableImage' }));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: () => {} }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Column: 'Column',
  IconButton: 'IconButton',
  Input: 'Input',
  Row: 'Row',
  Text: 'Text',
}));
jest.mock('@/platform/media', () => ({ mediaExists: () => true, mediaUri: (path: string) => `file://${path}` }));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/db/use-live', () => ({ useLive: (query: { all(): unknown[] }) => ({ data: query.all() }) }));

let tree: ReactTestRenderer | undefined;
let t: TestDatabase;
let patientId: string;
let snapshotCounter = 0;
const current = () => t.db.select().from(attachments).all();
const icon = (label: string) => tree!.root.findAllByType(IconButton).find((node) => node.props.label === label)!;
const prompt = () => tree!.root.findByType(PromptModal);
const caption = () => prompt().findByType(Input);
const submit = () =>
  prompt()
    .findAllByType(Button)
    .find((node) => node.props.label === 'ثبت')!;
async function settle() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}
async function invoke(action: () => unknown) {
  await act(async () => {
    action();
    await settle();
  });
}
async function render() {
  await act(async () => {
    tree = create(<MediaViewerScreen />);
  });
}
async function edit(text = 'Pending caption') {
  await invoke(() => icon('ویرایش توضیح').props.onPress());
  await invoke(() => caption().props.onChangeText(text));
}
function snapshot() {
  const path = `/media-viewer-intent-${++snapshotCounter}.db`;
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
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Media' });
  const id = await queries.addAttachment({
    entityType: 'patient',
    entityId: patientId,
    patientId,
    kind: 'clinical_photo',
    relativePath: 'imports/synthetic-derived.jpg',
    originalPath: 'imports/synthetic-original.jpg',
    caption: 'Source caption',
  });
  mockParams = { attachmentId: id };
  mockBack.mockClear();
  mockFocused = true;
  jest.mocked(alertError).mockClear();
  jest.mocked(Sharing.isAvailableAsync).mockReset().mockResolvedValue(true);
  jest.mocked(Sharing.shareAsync).mockReset().mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});

describe('media viewer mutation intent and actual caption prompt', () => {
  it('flushes the exact unsubmitted caption on dialog close and recovers it on cold remount', async () => {
    await render();
    await edit('  Raw caption\nPending detail  ');
    await invoke(() => prompt().props.onCancel());
    expect(current()[0]!.caption).toBe('Source caption');
    const row = t.db.select().from(attachmentCaptionDrafts).get()!;
    expect(decodeCaption(row.body).text).toBe('  Raw caption\nPending detail  ');
    expect(row.deletedAt).toBeNull();
    await act(async () => tree!.unmount());
    tree = undefined;
    await render();
    await invoke(() => icon('ویرایش توضیح').props.onPress());
    expect(caption().props.value).toBe('  Raw caption\nPending detail  ');
    await invoke(() => submit().props.onPress());
    expect(current()[0]!.caption).toBe('Raw caption\nPending detail');
    expect(t.db.select().from(attachmentCaptionDrafts).get()!.committedAttachmentId).toBe(mockParams.attachmentId);
  });
  it('continues autosaving after an explicit Keep mine rebase', async () => {
    await render();
    await edit('Local first');
    await queries.updateAttachment(mockParams.attachmentId, { caption: 'Independent caption' });
    await invoke(() => submit().props.onPress());
    const button = (label: string) => tree!.root.findAllByType(Button).find((n) => n.props.label === label)!;
    await invoke(() => button('بررسی نسخهٔ ذخیره‌شده').props.onPress());
    await invoke(() => button('نگه‌داشتن نسخهٔ من').props.onPress());
    const confirm = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((c) => c.text === 'نگه‌داشتن')!.onPress!;
    await invoke(confirm);
    await invoke(() => caption().props.onChangeText('Local later'));
    await invoke(() => prompt().props.onCancel());
    const row = t.db.select().from(attachmentCaptionDrafts).get()!;
    expect(decodeCaption(row.body)).toMatchObject({ text: 'Local later', baseCaption: 'Independent caption' });
    expect(current()[0]!.caption).toBe('Independent caption');
    await invoke(() => icon('ویرایش توضیح').props.onPress());
    await invoke(() => submit().props.onPress());
    expect(current()[0]!.caption).toBe('Local later');
  });
  it('refuses a confirmed stale Close after its originating viewer unmounts', async () => {
    const restore = snapshot();
    await render();
    await edit();
    await act(async () => restore());
    await invoke(() => icon('بستن').props.onPress());
    const confirm = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((c) => c.text === 'بستن')!.onPress!;
    await act(async () => tree!.unmount());
    tree = undefined;
    await invoke(confirm);
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('does not create a raw draft merely by opening and closing the caption dialog', async () => {
    await render();
    await invoke(() => icon('ویرایش توضیح').props.onPress());
    await invoke(() => prompt().props.onCancel());
    expect(t.db.select().from(attachmentCaptionDrafts).all()).toHaveLength(0);
  });
  it('refuses a held deletion after a real same-ID replacement without navigating', async () => {
    const restore = snapshot();
    const before = current();
    await render();
    await invoke(() => icon('حذف').props.onPress());
    const remove = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((choice) => choice.text === 'حذف')!.onPress!;
    await act(async () => restore());
    await invoke(remove);
    expect(current()).toEqual(before);
    expect(mockBack).not.toHaveBeenCalled();
    expect(alertError).toHaveBeenCalledWith('عکس حذف نشد', expect.any(DatasetChangedError));
  });
  it('refuses stale caption publication and retains actual typed input', async () => {
    const restore = snapshot();
    const before = current();
    await render();
    await edit();
    await act(async () => restore());
    await invoke(() => submit().props.onPress());
    expect(current()).toEqual(before);
    expect(prompt().props.visible).toBe(true);
    expect(caption().props.value).toBe('Pending caption');
    expect(alertError).toHaveBeenCalledWith('توضیح ذخیره نشد', expect.any(DatasetChangedError));
  });
  it('keeps typed input after SQL failure and publishes it on explicit retry', async () => {
    await render();
    await edit('Retry caption');
    const write = jest
      .spyOn(captionQueries, 'commitCaptionDraft')
      .mockRejectedValueOnce(new Error('Synthetic write failure'));
    await invoke(() => submit().props.onPress());
    expect(prompt().props.visible).toBe(true);
    expect(caption().props.value).toBe('Retry caption');
    expect(current()[0]!.caption).toBe('Source caption');
    await invoke(() => submit().props.onPress());
    expect(write).toHaveBeenCalledTimes(2);
    expect(current()[0]!.caption).toBe('Retry caption');
    expect(prompt().props.visible).toBe(false);
  });
  it('inherits a retained Scope when the viewer mounts after replacement', async () => {
    const restore = snapshot();
    const before = current();
    await act(async () => {
      tree = create(<AutosaveScope />);
    });
    await act(async () => restore());
    await act(async () =>
      tree!.update(
        <AutosaveScope>
          <MediaViewerScreen />
        </AutosaveScope>,
      ),
    );
    // A child first mounted after replacement cannot load a new editable seed
    // under its parent's old authority. A fresh route is required explicitly.
    expect(tree!.root.findAllByType(IconButton).filter((n) => n.props.label === 'ویرایش توضیح')).toHaveLength(0);
    expect(current()).toEqual(before);
  });
  it('rejects an old share callback before calling native sharing', async () => {
    const restore = snapshot();
    await render();
    const share = icon('اشتراک‌گذاری').props.onPress;
    await act(async () => restore());
    await invoke(share);
    expect(Sharing.isAvailableAsync).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(alertError).toHaveBeenCalledWith('اشتراک‌گذاری انجام نشد', expect.any(DatasetChangedError));
  });
  it('locks prompt input and holds admission through actual SQL acknowledgment', async () => {
    const actual = captionQueries.commitCaptionDraft;
    let release!: () => void;
    const acknowledgment = new Promise<void>((resolve) => {
      release = resolve;
    });
    const write = jest.spyOn(captionQueries, 'commitCaptionDraft').mockImplementation(async (...args) => {
      const result = await actual(...args);
      await acknowledgment;
      return result;
    });
    await render();
    await edit('Acknowledged caption');
    const save = submit().props.onPress;
    await invoke(save);
    const visible = prompt().props.visible;
    const editable = prompt().findAllByType(Input)[0]?.props.editable;
    const busy = prompt()
      .findAllByType(Button)
      .find((node) => node.props.label === 'ثبت')?.props.disabled;
    let refused = false;
    try {
      const replacement = reserveDatasetReplacement();
      replacement.release();
    } catch (error) {
      refused = error instanceof DatasetBusyError;
    }
    await invoke(save);
    await invoke(() => prompt().props.onCancel());
    const retained = prompt().props.visible;
    await act(async () => {
      release();
      await acknowledgment;
      await settle();
    });
    expect(visible).toBe(true);
    expect(editable).toBe(false);
    expect(busy).toBe(true);
    expect(retained).toBe(true);
    expect(refused).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(prompt().props.visible).toBe(false);
    expect(current()[0]!.caption).toBe('Acknowledged caption');
  });
  it('keeps admission while the native share sheet acknowledges the original URI', async () => {
    let release!: () => void;
    const ack = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.mocked(Sharing.shareAsync).mockImplementation(() => ack);
    await render();
    const heldShare = icon('اشتراک‌گذاری').props.onPress;
    await invoke(heldShare);
    await invoke(heldShare);
    expect(icon('اشتراک‌گذاری').props.disabled).toBe(true);
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    let refused = false;
    try {
      const replacement = reserveDatasetReplacement();
      replacement.release();
    } catch (error) {
      refused = error instanceof DatasetBusyError;
    }
    await act(async () => {
      release();
      await ack;
      await settle();
    });
    expect(refused).toBe(true);
    expect(icon('اشتراک‌گذاری').props.disabled).toBe(false);
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file://imports/synthetic-original.jpg', expect.any(Object));
  });
  it('soft-deletes and returns only after an ordinary acknowledged deletion', async () => {
    await render();
    await invoke(() => icon('حذف').props.onPress());
    await invoke(
      jest
        .mocked(Alert.alert)
        .mock.calls.at(-1)![2]!
        .find((choice) => choice.text === 'حذف')!.onPress!,
    );
    expect(current()[0]!.deletedAt).not.toBeNull();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('does not pop a newer route when a delayed deletion acknowledges', async () => {
    const actual = queries.deleteAttachment;
    let release!: () => void;
    const ack = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.spyOn(queries, 'deleteAttachment').mockImplementation(async (...args) => {
      await actual(...args);
      await ack;
    });
    await render();
    await invoke(() => icon('حذف').props.onPress());
    await invoke(
      jest
        .mocked(Alert.alert)
        .mock.calls.at(-1)![2]!
        .find((choice) => choice.text === 'حذف')!.onPress!,
    );
    mockFocused = false;
    await invoke(release);
    expect(current()[0]!.deletedAt).not.toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('shares a retained PNG original with its actual MIME instead of the JPEG preview MIME', async () => {
    t.db
      .update(attachments)
      .set({
        originalPath: 'imports/synthetic-original.png',
        originalMimeType: 'image/png',
        mimeType: 'image/jpeg',
      })
      .where(eq(attachments.id, mockParams.attachmentId))
      .run();
    await render();
    await invoke(() => icon('اشتراک‌گذاری').props.onPress());
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file://imports/synthetic-original.png', { mimeType: 'image/png' });
  });
  it('catches native share failure without losing the attachment', async () => {
    await render();
    const before = current();
    jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('Synthetic sharing failure'));
    await invoke(() => icon('اشتراک‌گذاری').props.onPress());
    expect(current()).toEqual(before);
    expect(alertError).toHaveBeenCalledWith('اشتراک‌گذاری انجام نشد', expect.any(Error));
    expect(mockBack).not.toHaveBeenCalled();
  });
});
