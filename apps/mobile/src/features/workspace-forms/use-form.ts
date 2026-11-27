import { useNavigation } from 'expo-router/react-navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { alertError } from '@/components/feedback';
import { useNow } from '@/components/use-now';
import { Autosave, type AutosaveState } from '@/lib/autosave';
import { assertDatasetWrite, datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { FormDraftConflict, UnsupportedFormDraft, type FormDocument } from '@/lib/form-document';
import { newId } from '@/lib/ids';

import {
  discardWorkspaceDraft,
  inspectWorkspaceForm,
  publishWorkspaceDraft,
  replaceWorkspaceDraft,
  sameFormComparison,
  saveWorkspaceDraft,
  workspaceFormSeed,
} from './queries';
import type { FormComparison, FormPort, FormRecord, FormSeed } from './types';

/** Shared lifecycle only; each feature owns raw fields, validation and synchronous publication. */
export function useWorkspaceForm<R extends FormRecord, F>(
  port: FormPort<R, F>,
  seed: FormSeed<R, F>,
  unavailable: boolean,
  onClose: () => void,
) {
  const scope = useAutosaveScope()!;
  const navigation = useNavigation();
  const { generation, stale } = useDatasetIntent();
  const now = useNow();
  const [document, setDocument] = useState(() => seed.document);
  const latest = useRef(document),
    acting = useRef(false),
    mounted = useRef(true),
    finished = useRef(false);
  const ownerUnavailable = useRef(unavailable);
  const dialog = useRef<symbol | null>(null);
  const [busy, setBusy] = useState(false);
  const [failedAction, setFailedAction] = useState(false);
  const [completed, setCompleted] = useState<'saved' | 'discarded' | null>(null);
  const [comparison, setComparison] = useState<FormComparison<R> | null>(null);
  const [state, setState] = useState<AutosaveState>({ status: 'idle' });
  useLayoutEffect(() => {
    ownerUnavailable.current = unavailable;
  }, [unavailable]);
  const [persistence] = useState(() => {
    let id = seed.draft?.id ?? newId(),
      revision = seed.draft?.revision ?? 0;
    const saver = new Autosave<FormDocument<F>>({
      generation,
      onState: setState,
      shouldRetry: (error) => !(error instanceof FormDraftConflict || error instanceof UnsupportedFormDraft),
      write: async (value) => {
        revision = await saveWorkspaceDraft(port, id, value, revision, generation);
      },
    });
    return {
      saver,
      id: () => id,
      revision: () => revision,
      adopt(nextId: string, nextRevision: number) {
        id = nextId;
        revision = nextRevision;
      },
    };
  });
  const saver = persistence.saver;
  useEffect(
    () =>
      scope.group.register({
        get unsaved() {
          return acting.current || dialog.current !== null || saver.unsaved;
        },
        flush: async () => !acting.current && dialog.current === null && (await saver.flush()),
      }),
    [scope, saver],
  );
  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void saver.flush();
    });
    return () => {
      mounted.current = false;
      dialog.current = null;
      sub.remove();
      void saver.flush();
    };
  }, [saver]);
  function interactive() {
    return mounted.current && !ownerUnavailable.current && navigation.isFocused();
  }
  function assertOwner() {
    assertDatasetWrite(generation);
    if (!mounted.current || ownerUnavailable.current) throw new FormDraftConflict();
  }
  function change(input: Partial<F> | ((fields: F) => Partial<F>)) {
    if (acting.current || dialog.current || finished.current || !interactive() || generation !== datasetGeneration())
      return;
    const patch = typeof input === 'function' ? input(latest.current.fields) : input;
    const next = { ...latest.current, fields: { ...latest.current.fields, ...patch } };
    latest.current = next;
    setDocument(next);
    saver.change(next);
  }
  async function flush() {
    if (!(await saver.flush()) || saver.unsaved) {
      assertDatasetWrite(generation);
      throw new Error('پیش‌نویس ذخیره نشد؛ نوشته روی صفحه باقی مانده است.');
    }
  }
  async function perform(work: () => Promise<void>, allowCompleted = false, allowUnavailable = false) {
    if (
      acting.current ||
      dialog.current ||
      !(allowUnavailable ? mounted.current && navigation.isFocused() : interactive()) ||
      (finished.current && !allowCompleted)
    )
      return;
    acting.current = true;
    setBusy(true);
    try {
      await withDatasetWrite(generation, work);
      if (mounted.current) setFailedAction(false);
    } catch (error) {
      if (mounted.current) {
        setFailedAction(true);
        alertError('ثبت نشد', error);
      }
    } finally {
      acting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function closeFocused() {
    if (generation === datasetGeneration() && interactive()) onClose();
  }
  function save(validate: (fields: F) => boolean) {
    return perform(async () => {
      if (!finished.current) {
        saver.change(latest.current);
        await flush();
        assertOwner();
        if (!validate(latest.current.fields)) return;
        await publishWorkspaceDraft(
          port,
          persistence.id(),
          seed.document.recordId,
          persistence.revision(),
          new Date(now),
          generation,
        );
        finished.current = true;
        saver.cancel();
        if (mounted.current) setCompleted('saved');
      }
    }, true).then(() => {
      if (finished.current) closeFocused();
    });
  }
  function confirm(title: string, message: string, label: string, work: () => Promise<void>, staleClose = false) {
    if (
      acting.current ||
      dialog.current ||
      !mounted.current ||
      !navigation.isFocused() ||
      (!staleClose && (ownerUnavailable.current || finished.current))
    )
      return;
    const intent = Symbol();
    dialog.current = intent;
    setBusy(true);
    const consume = (accepted: boolean) => {
      if (!mounted.current || dialog.current !== intent) return;
      dialog.current = null;
      setBusy(false);
      if (!accepted || !navigation.isFocused() || (!staleClose && ownerUnavailable.current)) return;
      if (staleClose) void work().catch((error) => alertError('بسته نشد', error));
      else
        void perform(work).then(() => {
          if (finished.current) closeFocused();
        });
    };
    Alert.alert(
      title,
      message,
      [
        { text: 'انصراف', style: 'cancel', onPress: () => consume(false) },
        { text: label, onPress: () => consume(true) },
      ],
      { cancelable: true, onDismiss: () => consume(false) },
    );
  }
  function adopt(next: { id: string; revision: number; document: FormDocument<F> }) {
    persistence.adopt(next.id, next.revision);
    latest.current = next.document;
    setDocument(next.document);
    // Replaces a failed pending value without remounting the screen/removal guard.
    saver.change(next.document);
  }
  function keepMine() {
    const shown = comparison;
    if (!shown) return;
    confirm(
      'نوشتهٔ این صفحه نگه داشته شود؟',
      'فقط پیش‌نویس تطبیق داده می‌شود. برای ثبت نهایی دوباره «ذخیره» را بزنید.',
      'نگه‌داشتن نسخهٔ من',
      async () => {
        await saver.flush();
        assertOwner();
        if (!interactive()) throw new FormDraftConflict();
        const next = await replaceWorkspaceDraft(
          port,
          persistence.id(),
          latest.current,
          shown,
          new Date(now),
          generation,
        );
        assertOwner();
        adopt(next);
        await flush();
        setComparison(null);
      },
    );
  }
  function loadStored() {
    const shown = comparison;
    if (!shown?.draft) return;
    confirm(
      'پیش‌نویس ذخیره‌شده بارگذاری شود؟',
      'نوشتهٔ این صفحه جایگزین می‌شود؛ پیش از ادامه آن را مرور یا کپی کنید.',
      'بارگذاری',
      async () => {
        await saver.flush();
        assertOwner();
        if (!interactive()) throw new FormDraftConflict();
        const live = await inspectWorkspaceForm(port, persistence.id(), seed.document.recordId, generation);
        if (!sameFormComparison(live, shown) || live.original?.committedId || !live.draft)
          throw new FormDraftConflict();
        const next = workspaceFormSeed(port, live, seed.document.recordId, new Date(now)).document;
        assertOwner();
        adopt({ id: live.draft.id, revision: live.draft.revision, document: next });
        await flush();
        setComparison(null);
      },
    );
  }
  function discard() {
    confirm('پیش‌نویس حذف شود؟', 'رکوردهای ثبت‌شده تغییر نمی‌کنند.', 'حذف پیش‌نویس', async () => {
      await flush();
      assertOwner();
      if (!interactive()) throw new FormDraftConflict();
      await discardWorkspaceDraft(
        port.codec.kind,
        persistence.id(),
        seed.document.recordId,
        persistence.revision(),
        new Date(now),
        generation,
        port.parentId ?? null,
      );
      finished.current = true;
      saver.cancel();
      if (mounted.current) setCompleted('discarded');
    });
  }
  function close() {
    if (generation !== datasetGeneration()) {
      confirm(
        'فرم قدیمی بسته شود؟',
        'پیش از بستن نوشته‌ها را مرور یا کپی کنید.',
        'بستن',
        async () => {
          if (generation === datasetGeneration() || !mounted.current || !navigation.isFocused()) return;
          scope.abandonStale();
          onClose();
        },
        true,
      );
    } else {
      let saved = false;
      void perform(
        async () => {
          await flush();
          saved = true;
        },
        true,
        true,
      ).then(() => {
        if (saved && mounted.current && navigation.isFocused()) onClose();
      });
    }
  }
  async function related<T>(work: () => Promise<T>): Promise<T> {
    if (acting.current || dialog.current || finished.current || !interactive()) throw new FormDraftConflict();
    acting.current = true;
    setBusy(true);
    try {
      return await withDatasetWrite(generation, async () => {
        assertOwner();
        const result = await work();
        assertOwner();
        if (!interactive()) throw new FormDraftConflict();
        return result;
      });
    } finally {
      acting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    document,
    state,
    busy,
    completed,
    failedAction,
    comparison,
    stale,
    locked: busy || !!completed || stale || unavailable,
    hasDraft: !!seed.draft || state.status !== 'idle',
    change,
    canChange: () =>
      !acting.current && !dialog.current && !finished.current && interactive() && generation === datasetGeneration(),
    save,
    close,
    discard,
    keepMine,
    loadStored,
    retry: () => perform(flush),
    compare: () =>
      perform(async () => {
        await saver.flush();
        assertOwner();
        if (!interactive()) throw new FormDraftConflict();
        setComparison(await inspectWorkspaceForm(port, persistence.id(), seed.document.recordId, generation));
      }),
    related,
  };
}
