import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { alertError, notify } from '@/components/feedback';
import { Autosave, type AutosaveState } from '@/lib/autosave';
import { assertDatasetWrite, datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { newId } from '@/lib/ids';
import {
  encodeImageDraft,
  ImageEditConflict,
  type ImageDocument,
  type ImageDraftDocument,
  type ImageMark,
  type PendingImageText,
} from '@/lib/image-edit';

import {
  discardImageEditDraft,
  inspectImageEdit,
  publishImageEditDraft,
  resolveImageEdit,
  saveImageEditDraft,
  type ImageEditComparison,
  type ImageEditSeed,
} from './image-edit-queries';

/** One immutable attachment intent, one serialized writer, one route removal guard. */
export function useImageEdit(seed: ImageEditSeed, expectedGeneration: number) {
  const { generation, stale } = useDatasetIntent(expectedGeneration);
  const scope = useAutosaveScope();
  const router = useRouter();
  const navigation = useNavigation();
  const [document, setDocument] = useState(seed.document);
  const latest = useRef(document);
  const acting = useRef(false);
  const published = useRef(false);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const drawingRef = useRef(false);
  const [comparison, setComparison] = useState<ImageEditComparison | null>(null);
  const [state, setState] = useState<AutosaveState>({ status: 'idle' });
  const past = useRef<ImageDocument[]>([]),
    future = useRef<ImageDocument[]>([]);
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [persistence] = useState(() => {
    let id = seed.row.draft?.id ?? newId();
    let basis = seed.basis;
    let revision = seed.row.draft?.revision ?? 0;
    return {
      id: () => id,
      basis: () => basis,
      revision: () => revision,
      adopt: (next: { id: string; revision: number; basis: typeof basis }) => {
        id = next.id;
        revision = next.revision;
        basis = next.basis;
      },
      saver: new Autosave<ImageDraftDocument>({
        generation,
        onState: setState,
        shouldRetry: (e) => !(e instanceof ImageEditConflict),
        write: async (value) => {
          revision = await saveImageEditDraft(id, basis, value, revision);
        },
      }),
    };
  });
  const saver = persistence.saver;
  useEffect(
    () =>
      scope?.group.register({
        get unsaved() {
          return acting.current || saver.unsaved;
        },
        async flush() {
          return !acting.current && (await saver.flush()) && !acting.current;
        },
      }),
    [scope, saver],
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (value) => {
      if (value !== 'active') void saver.flush();
    });
    return () => {
      sub.remove();
      void saver.flush();
    };
  }, [saver]);

  function update(next: ImageDraftDocument) {
    latest.current = next;
    saver.change(next);
    setDocument(next);
  }
  function writable(allowDrawing = false) {
    if (acting.current || published.current || (!allowDrawing && drawingRef.current)) return false;
    try {
      assertDatasetWrite(generation);
      return true;
    } catch (error) {
      alertError('فرم قبلی تغییر نمی‌کند', error);
      return false;
    }
  }
  function setHistoryState() {
    setHistory({ undo: past.current.length > 0, redo: future.current.length > 0 });
  }
  function remember() {
    past.current = [...past.current.slice(-29), latest.current.image];
    future.current = [];
    setHistoryState();
  }
  function drawImage(next: ImageDocument, beginCommand = true) {
    if (!writable(true) || (!beginCommand && !drawingRef.current)) return false;
    // Completed strokes are bounded by the canvas. Validate larger external
    // commands once, not by walking every old mark at each pointer event.
    if (beginCommand) {
      try {
        encodeImageDraft({ ...latest.current, image: next });
      } catch (error) {
        notify('علامت اضافه نشد', error instanceof Error ? error.message : 'علامت معتبر نیست.');
        return false;
      }
    }
    if (beginCommand) remember();
    update({ ...latest.current, image: next });
    return true;
  }
  function changeImage(next: ImageDocument) {
    if (writable()) drawImage(next);
  }
  function undo() {
    if (!writable() || !past.current.length) return;
    const previous = past.current.pop()!;
    future.current.push(latest.current.image);
    update({ ...latest.current, image: previous });
    setHistoryState();
  }
  function redo() {
    if (!writable() || !future.current.length) return;
    const next = future.current.pop()!;
    past.current.push(latest.current.image);
    update({ ...latest.current, image: next });
    setHistoryState();
  }
  function text(value: PendingImageText | null) {
    if (writable()) update({ ...latest.current, pendingText: value });
  }
  function applyPendingText() {
    const pending = latest.current.pendingText;
    if (!pending) return;
    if (!pending.text.trim()) {
      update({ ...latest.current, pendingText: null });
      return;
    }
    const mark: ImageMark = { ...pending, kind: 'text' };
    const marks = [...latest.current.image.marks.filter((m) => m.id !== pending.id), mark];
    if (marks.length > 200) throw new Error('تعداد علامت‌ها زیاد شده است؛ علامت‌های اضافی را پاک کنید.');
    encodeImageDraft({ version: 1, image: { ...latest.current.image, marks }, pendingText: null });
    remember();
    update({ version: 1, image: { ...latest.current.image, marks }, pendingText: null });
  }
  function applyText() {
    if (writable()) applyPendingText();
  }
  function begin() {
    if (acting.current || drawingRef.current) return false;
    acting.current = true;
    setBusy(true);
    return true;
  }
  function end() {
    acting.current = false;
    setBusy(false);
  }
  async function flush() {
    if (!(await saver.flush()) || saver.unsaved)
      throw new Error('پیش‌نویس عکس ذخیره نشد؛ ویرایش روی صفحه باقی مانده است.');
  }
  async function save() {
    if (!begin()) return;
    try {
      await withDatasetWrite(generation, async () => {
        if (published.current) {
          end();
          if (navigation.isFocused()) router.back();
          return;
        }
        applyPendingText();
        await flush();
        if (persistence.revision() !== 0)
          await publishImageEditDraft(persistence.id(), persistence.basis(), persistence.revision());
        published.current = true;
        setCompleted(true);
        saver.cancel();
        end();
        if (navigation.isFocused()) router.back();
      });
    } catch (error) {
      alertError('ویرایش عکس ذخیره نشد', error);
      end();
    }
  }
  function discard() {
    if (published.current) return;
    if (!begin()) return;
    Alert.alert(
      'کنار گذاشتن ویرایش؟',
      'اصل عکس و نسخه‌های ثبت‌شده باقی می‌مانند.',
      [
        { text: 'انصراف', style: 'cancel', onPress: end },
        {
          text: 'کنار گذاشتن',
          style: 'destructive',
          onPress: () => {
            void withDatasetWrite(generation, async () => {
              await flush();
              await discardImageEditDraft(persistence.id(), persistence.basis(), persistence.revision());
              published.current = true;
              setCompleted(true);
              saver.cancel();
              end();
              if (navigation.isFocused()) router.back();
            }).catch((error) => {
              end();
              alertError('ویرایش کنار گذاشته نشد', error);
            });
          },
        },
      ],
      { cancelable: false },
    );
  }
  async function compare() {
    if (published.current) return;
    if (!begin()) return;
    try {
      await withDatasetWrite(generation, async () => {
        await saver.flush();
        setComparison(await inspectImageEdit(persistence.basis()));
      });
    } catch (error) {
      alertError('نسخهٔ فعلی خوانده نشد', error);
    } finally {
      end();
    }
  }
  async function resolve(choice: 'local' | 'stored') {
    if (published.current) return;
    if (!comparison || !begin()) return;
    try {
      await withDatasetWrite(generation, async () => {
        await saver.flush();
        const next = await resolveImageEdit(persistence.basis(), latest.current, comparison, choice);
        persistence.adopt(next);
        update(next.document);
        await flush();
        past.current = [];
        future.current = [];
        setHistoryState();
        setComparison(null);
      });
    } catch (error) {
      alertError('نسخه جایگزین نشد؛ ویرایش نگه داشته شد', error);
    } finally {
      end();
    }
  }
  function closeStale() {
    if (generation === datasetGeneration() || acting.current) return;
    Alert.alert(
      'بستن فرم قبلی؟',
      'اطلاعات از بکاپ جایگزین شده است. نوشتهٔ ذخیره‌نشده را پیش از بستن کپی کنید؛ این فرم اطلاعات بازگردانی‌شده را تغییر نمی‌دهد.',
      [
        { text: 'ادامهٔ مرور', style: 'cancel' },
        {
          text: 'بستن فرم',
          style: 'destructive',
          onPress: () => {
            if (generation === datasetGeneration()) return;
            scope?.abandonStale();
            saver.cancel();
            published.current = true;
            setCompleted(true);
            if (navigation.isFocused()) router.back();
          },
        },
      ],
    );
  }
  return {
    document,
    latest,
    busy,
    completed,
    stale,
    drawing,
    state,
    history,
    comparison,
    compare,
    resolve,
    changeImage,
    drawImage,
    text,
    applyText,
    undo,
    redo,
    save,
    discard,
    setDrawing: (value: boolean) => {
      drawingRef.current = value;
      setDrawing(value);
    },
    closeComparison: () => setComparison(null),
    closeStale,
    close: () => {
      if (generation !== datasetGeneration()) {
        closeStale();
        return;
      }
      if (!acting.current && navigation.isFocused()) router.back();
    },
    retry: () => {
      void saver.flush().then((ok) => {
        if (!ok) notify('پیش‌نویس ذخیره نشد', 'ویرایش روی صفحه باقی مانده است.');
      });
    },
  };
}
