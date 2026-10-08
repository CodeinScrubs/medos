import { useRouter } from 'expo-router';
import { useNavigation } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { alertError, notify } from '@/components/feedback';
import { useNow } from '@/components/use-now';
import { Autosave, type AutosaveState } from '@/lib/autosave';
import { datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { newId } from '@/lib/ids';

import { decodeLabForm, initialLabForm, LabFormConflict, labFormValues, type LabFormFields } from './form-draft';
import {
  commitLabFormDraft,
  discardLabFormDraft,
  inspectLabForm,
  labFormQuery,
  replaceLabFormDraft,
  saveLabFormDraft,
  type LabFormComparison,
  type LabFormRows,
} from './form-draft-queries';

export function useLabForm(seed: LabFormRows, onReset: (rows: LabFormRows) => void) {
  const scope = useAutosaveScope()!;
  const { generation, stale } = useDatasetIntent();
  const router = useRouter();
  const navigation = useNavigation();
  const now = useNow();
  const context = seed[0]!;
  const patientId = context.patient.id;
  const panelId = context.panel?.id ?? null;
  const [document, setDocument] = useState(() =>
    context.draft
      ? decodeLabForm(context.draft.body)
      : initialLabForm(
          context.panel,
          seed.flatMap((r) => (r.value ? [r.value] : [])),
          context.active?.id ?? null,
          new Date(now),
        ),
  );
  const latest = useRef(document);
  const acting = useRef(false);
  const pasting = useRef(false);
  const mounted = useRef(true);
  const published = useRef(false);
  const dialog = useRef<symbol | null>(null);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState<'saved' | 'discarded' | null>(null);
  const [failedWrite, setFailedWrite] = useState(false);
  const [comparison, setComparison] = useState<LabFormComparison | null>(null);
  const [state, setState] = useState<AutosaveState>({ status: 'idle' });
  const [persistence] = useState(() => {
    let id = context.draft?.id ?? newId();
    let revision = context.draft?.revision ?? 0;
    const saver = new Autosave<typeof document>({
      generation,
      onState: setState,
      shouldRetry: (e) => !(e instanceof LabFormConflict),
      write: async (value) => {
        revision = await saveLabFormDraft(id, patientId, panelId, value, revision, generation);
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
          return acting.current || pasting.current || dialog.current !== null || saver.unsaved;
        },
        flush: async () => !acting.current && !pasting.current && dialog.current === null && (await saver.flush()),
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
  function change(patch: Partial<LabFormFields> | ((fields: LabFormFields) => LabFormFields)) {
    if (acting.current || dialog.current || published.current || !mounted.current || generation !== datasetGeneration())
      return;
    const fields = typeof patch === 'function' ? patch(latest.current.fields) : { ...latest.current.fields, ...patch };
    const next = { ...latest.current, fields };
    latest.current = next;
    setDocument(next);
    saver.change(next);
  }
  async function flush() {
    if (!(await saver.flush()) || saver.unsaved) throw new Error('پیش‌نویس ذخیره نشد؛ نوشته روی صفحه باقی مانده است.');
  }
  async function perform(action: () => Promise<void>, allowCompleted = false) {
    if (
      acting.current ||
      pasting.current ||
      dialog.current ||
      !mounted.current ||
      (published.current && !allowCompleted)
    )
      return;
    acting.current = true;
    setBusy(true);
    try {
      await withDatasetWrite(generation, action);
      if (mounted.current) setFailedWrite(false);
    } catch (e) {
      if (mounted.current) setFailedWrite(true);
      alertError(published.current ? 'ثبت شد؛ صفحه بسته نشد' : 'ذخیره نشد', e);
    } finally {
      acting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function closeFocused() {
    if (navigation.isFocused()) router.back();
  }
  function save(hasPhoto: boolean) {
    return perform(async () => {
      if (!published.current) {
        try {
          labFormValues(latest.current, new Date(now), hasPhoto);
        } catch (e) {
          notify('آزمایش ثبت نشد', e instanceof Error ? e.message : 'ورودی‌ها را بررسی کنید.');
          return;
        }
        saver.change(latest.current);
        await flush();
        await commitLabFormDraft(
          persistence.id(),
          patientId,
          panelId,
          persistence.revision(),
          new Date(now),
          generation,
        );
        published.current = true;
        setCompleted('saved');
        saver.cancel();
      }
      acting.current = false;
      closeFocused();
    }, true);
  }
  function confirm(
    title: string,
    message: string,
    action: () => Promise<void>,
    label: string,
    destructive = false,
    allowStale = false,
  ) {
    if (acting.current || pasting.current || dialog.current || !mounted.current || (published.current && !allowStale))
      return;
    const intent = Symbol();
    dialog.current = intent;
    setBusy(true);
    const consume = (accepted: boolean) => {
      if (!mounted.current || dialog.current !== intent) return;
      dialog.current = null;
      setBusy(false);
      if (accepted) {
        if (allowStale) void action().catch((e) => alertError('بسته نشد', e));
        else void perform(action);
      }
    };
    Alert.alert(
      title,
      message,
      [
        { text: 'انصراف', style: 'cancel', onPress: () => consume(false) },
        { text: label, style: destructive ? 'destructive' : 'default', onPress: () => consume(true) },
      ],
      { cancelable: true, onDismiss: () => consume(false) },
    );
  }
  function loadStored() {
    confirm(
      'بارگذاری نسخهٔ ذخیره‌شده؟',
      'نوشتهٔ این فرم جایگزین می‌شود؛ پیش از ادامه آن را مرور یا کپی کنید.',
      async () => {
        await saver.flush();
        const rows = labFormQuery(patientId, panelId).all();
        if (!rows[0]) throw new LabFormConflict();
        if (rows[0].draft) decodeLabForm(rows[0].draft.body);
        saver.cancel();
        acting.current = false;
        onReset(rows);
      },
      'بارگذاری',
    );
  }
  function keepMine() {
    const shown = comparison;
    if (!shown) return;
    confirm(
      'نسخهٔ این صفحه جایگزین شود؟',
      'مقادیر پنل با این نسخه جایگزین خواهند شد؛ این کار ادغام خودکار نیست.',
      async () => {
        await saver.flush();
        const next = await replaceLabFormDraft(persistence.id(), patientId, panelId, latest.current, shown, generation);
        persistence.adopt(next.id, next.revision);
        latest.current = next.document;
        setDocument(next.document);
        saver.change(next.document);
        await flush();
        setComparison(null);
      },
      'نگه‌داشتن نسخهٔ من',
    );
  }
  function discard() {
    confirm(
      'حذف پیش‌نویس آزمایش؟',
      'فقط نوشتهٔ این فرم کنار گذاشته می‌شود؛ آزمایش ثبت‌شده تغییر نمی‌کند.',
      async () => {
        await flush();
        await discardLabFormDraft(persistence.id(), patientId, panelId, persistence.revision(), generation);
        published.current = true;
        setCompleted('discarded');
        saver.cancel();
        acting.current = false;
        closeFocused();
      },
      'حذف پیش‌نویس',
      true,
    );
  }
  function close() {
    if (acting.current || pasting.current || dialog.current) return;
    if (!stale) {
      closeFocused();
      return;
    }
    confirm(
      'بستن فرم قدیمی؟',
      'پیش از بستن نوشته‌های روی صفحه را مرور یا کپی کنید.',
      async () => {
        scope.abandonStale();
        closeFocused();
      },
      'بستن فرم',
      false,
      true,
    );
  }
  return {
    beginPaste: () => {
      if (acting.current || pasting.current || dialog.current || published.current || !mounted.current) return false;
      pasting.current = true;
      return true;
    },
    endPaste: () => {
      pasting.current = false;
    },
    form: document.fields,
    document,
    change,
    state,
    busy,
    completed,
    failedWrite,
    stale,
    comparison,
    save,
    close,
    discard,
    keepMine,
    loadStored,
    hasDraft: !!context.draft || state.status !== 'idle',
    retry: () => perform(flush),
    compare: () =>
      perform(async () => {
        await saver.flush();
        setComparison(await inspectLabForm(persistence.id(), patientId, panelId, generation));
      }),
  };
}
