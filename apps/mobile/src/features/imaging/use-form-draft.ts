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

import {
  ImagingFormConflict,
  imagingFormValues,
  imagingBase,
  decodeImagingForm,
  initialImagingForm,
  type ImagingFormFields,
} from './form-draft';
import {
  commitImagingFormDraft,
  discardImagingFormDraft,
  inspectImagingForm,
  replaceImagingFormDraft,
  saveImagingFormDraft,
  type ImagingFormComparison,
  type ImagingFormRow,
} from './form-draft-queries';

/** One screen owns text, its original dataset and serialized draft/publication acknowledgment. */
export function useImagingForm(seed: ImagingFormRow, onReset: (row: ImagingFormRow) => void) {
  const scope = useAutosaveScope()!;
  const { generation, stale } = useDatasetIntent();
  const navigation = useNavigation();
  const router = useRouter();
  const now = useNow();
  const patientId = seed.patient.id;
  const studyId = seed.study?.id ?? null;
  const [document, setDocument] = useState(() =>
    seed.draft
      ? decodeImagingForm(seed.draft.body)
      : initialImagingForm(seed.study, seed.active?.id ?? null, new Date(now)),
  );
  const latest = useRef(document);
  const acting = useRef(false);
  const mounted = useRef(true);
  const published = useRef(false);
  const dialog = useRef<symbol | null>(null);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState<'saved' | 'discarded' | null>(null);
  const [failedWrite, setFailedWrite] = useState(false);
  const [comparison, setComparison] = useState<ImagingFormComparison | null>(null);
  const [state, setState] = useState<AutosaveState>({ status: 'idle' });
  const [persistence] = useState(() => {
    let id = seed.draft?.id ?? newId();
    let revision = seed.draft?.revision ?? 0;
    const saver = new Autosave<typeof document>({
      generation,
      onState: setState,
      shouldRetry: (error) => !(error instanceof ImagingFormConflict),
      write: async (value) => {
        revision = await saveImagingFormDraft(id, patientId, studyId, value, revision, generation);
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
  function change(patch: Partial<ImagingFormFields>) {
    if (acting.current || dialog.current || published.current || !mounted.current || generation !== datasetGeneration())
      return;
    const next = { ...latest.current, fields: { ...latest.current.fields, ...patch } };
    latest.current = next;
    setDocument(next);
    saver.change(next);
  }
  async function flush() {
    if (!(await saver.flush()) || saver.unsaved) throw new Error('پیش‌نویس ذخیره نشد؛ نوشته روی صفحه باقی مانده است.');
  }
  async function perform(action: () => Promise<void>, allowCompleted = false) {
    if (acting.current || dialog.current || !mounted.current || (published.current && !allowCompleted)) return;
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
  function save() {
    return perform(async () => {
      if (!published.current) {
        // A rejected publication must still acknowledge the exact raw input.
        saver.change(latest.current);
        await flush();
        try {
          imagingFormValues(latest.current, new Date(now));
        } catch (e) {
          notify('تصویربرداری ثبت نشد', e instanceof Error ? e.message : 'تاریخ را بررسی کنید.');
          return;
        }
        await commitImagingFormDraft(
          persistence.id(),
          patientId,
          studyId,
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
    if (acting.current || dialog.current || !mounted.current || (published.current && !allowStale)) return;
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
    const shown = comparison;
    if (!shown) return;
    confirm(
      'بارگذاری پیش‌نویس ذخیره‌شده؟',
      'نوشتهٔ این صفحه جایگزین می‌شود؛ پیش از ادامه آن را مرور یا کپی کنید.',
      async () => {
        await saver.flush();
        const original = await inspectImagingForm(persistence.id(), patientId, studyId, generation);
        if (original.original?.committedStudyId) throw new ImagingFormConflict();
        const row = original.row;
        if (
          row.draft?.id !== shown.row.draft?.id ||
          row.draft?.revision !== shown.row.draft?.revision ||
          row.draft?.body !== shown.row.draft?.body ||
          JSON.stringify(row.study ? imagingBase(row.study) : null) !==
            JSON.stringify(shown.row.study ? imagingBase(shown.row.study) : null)
        )
          throw new ImagingFormConflict();
        if (row.draft) decodeImagingForm(row.draft.body);
        saver.cancel();
        acting.current = false;
        onReset(row);
      },
      'بارگذاری',
    );
  }
  function keepMine() {
    const shown = comparison;
    if (!shown) return;
    confirm(
      'پیش‌نویس این صفحه نگه داشته شود؟',
      'پیش‌نویس نمایش‌داده‌شده با نوشتهٔ این صفحه جایگزین می‌شود؛ هنوز تصویربرداری‌ای در پرونده ثبت نمی‌شود.',
      async () => {
        await saver.flush();
        const next = await replaceImagingFormDraft(
          persistence.id(),
          patientId,
          studyId,
          latest.current,
          shown,
          new Date(now),
          generation,
        );
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
      'حذف پیش‌نویس تصویربرداری؟',
      'فقط نوشتهٔ منتشرنشدهٔ این فرم کنار گذاشته می‌شود؛ تصویربرداری‌های ثبت‌شده تغییر نمی‌کنند.',
      async () => {
        await flush();
        await discardImagingFormDraft(persistence.id(), patientId, studyId, persistence.revision(), generation);
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
    if (acting.current || dialog.current || !mounted.current || !navigation.isFocused()) return;
    if (generation === datasetGeneration()) {
      closeFocused();
      return;
    }
    confirm(
      'بستن فرم قدیمی؟',
      'پیش از بستن نوشته‌های روی صفحه را مرور یا کپی کنید.',
      async () => {
        if (!navigation.isFocused() || generation === datasetGeneration()) return;
        scope.abandonStale();
        closeFocused();
      },
      'بستن فرم',
      false,
      true,
    );
  }
  return {
    document,
    changeDate: (patch: Partial<ImagingFormFields['date']>) =>
      change({ date: { ...latest.current.fields.date, ...patch } }),
    form: document.fields,
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
    loadStored,
    keepMine,
    hasDraft: !!seed.draft || state.status !== 'idle',
    retry: () => perform(flush),
    compare: () =>
      perform(async () => {
        await saver.flush();
        setComparison(await inspectImagingForm(persistence.id(), patientId, studyId, generation));
      }),
  };
}
