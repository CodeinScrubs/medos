import { useNavigation } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { alertError } from '@/components/feedback';
import { useNow } from '@/components/use-now';
import { Autosave, type AutosaveState } from '@/lib/autosave';
import { datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { newId } from '@/lib/ids';

import {
  decodeVitalForm,
  initialVitalForm,
  VitalFormConflict,
  type VitalFormDocument,
  type VitalFormFields,
} from './form-draft';
import {
  commitVitalFormDraft,
  discardVitalFormDraft,
  inspectVitalForm,
  replaceVitalFormDraft,
  sameVitalComparison,
  saveVitalFormDraft,
  type VitalFormComparison,
  type VitalFormRow,
} from './form-draft-queries';

/** This inline editor participates in the patient screen's one removal guard. */
export function useVitalForm(
  seed: VitalFormRow,
  onClose: () => void,
  onReset: (row: VitalFormRow) => void,
  isSwitching: () => boolean,
) {
  const scope = useAutosaveScope();
  const navigation = useNavigation();
  const { generation, stale } = useDatasetIntent();
  const now = useNow();
  const patientId = seed.patient.id,
    vitalId = seed.vital?.id ?? null;
  const [document, setDocument] = useState(() =>
    seed.draft
      ? decodeVitalForm(seed.draft.body)
      : initialVitalForm(seed.vital, seed.active?.id ?? null, new Date(now)),
  );
  const latest = useRef(document);
  const acting = useRef(false),
    mounted = useRef(true),
    finished = useRef(false);
  const dialog = useRef<symbol | null>(null);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState<'saved' | 'discarded' | null>(null);
  const [failedWrite, setFailedWrite] = useState(false);
  const [comparison, setComparison] = useState<VitalFormComparison | null>(null);
  const [state, setState] = useState<AutosaveState>({ status: 'idle' });
  const [persistence] = useState(() => {
    let id = seed.draft?.id ?? newId(),
      revision = seed.draft?.revision ?? 0;
    const saver = new Autosave<VitalFormDocument>({
      generation,
      onState: setState,
      shouldRetry: (e) => !(e instanceof VitalFormConflict),
      write: async (value) => {
        revision = await saveVitalFormDraft(id, patientId, vitalId, value, revision, generation);
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
      scope?.group.register({
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
  function change(patch: Partial<VitalFormFields>) {
    if (
      acting.current ||
      dialog.current ||
      finished.current ||
      !mounted.current ||
      isSwitching() ||
      generation !== datasetGeneration()
    )
      return;
    const next = { ...latest.current, fields: { ...latest.current.fields, ...patch } };
    latest.current = next;
    setDocument(next);
    saver.change(next);
  }
  async function flush() {
    if (!(await saver.flush()) || saver.unsaved) {
      // Preserve the actual conflict/dataset identity so callers and diagnostics
      // do not mislabel a refused old write as a generic disk failure.
      if (generation !== datasetGeneration()) await withDatasetWrite(generation, async () => {});
      throw new Error('پیش‌نویس ذخیره نشد؛ نوشته روی صفحه باقی مانده است.');
    }
  }
  async function perform(work: () => Promise<void>, allowCompleted = false) {
    if (acting.current || dialog.current || !mounted.current || isSwitching() || (finished.current && !allowCompleted))
      return;
    acting.current = true;
    setBusy(true);
    try {
      await withDatasetWrite(generation, work);
      if (mounted.current) setFailedWrite(false);
    } catch (e) {
      if (mounted.current) setFailedWrite(true);
      alertError('ثبت نشد', e);
    } finally {
      acting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function closeFocused() {
    if (mounted.current && navigation.isFocused()) onClose();
  }
  function save(validate: (document: VitalFormDocument) => boolean) {
    return perform(async () => {
      if (!finished.current) {
        saver.change(latest.current);
        await flush();
        if (!validate(latest.current)) return;
        await commitVitalFormDraft(
          persistence.id(),
          patientId,
          vitalId,
          persistence.revision(),
          new Date(now),
          generation,
        );
        finished.current = true;
        setCompleted('saved');
        saver.cancel();
      }
      closeFocused();
    }, true);
  }
  function confirm(
    title: string,
    message: string,
    work: () => Promise<void>,
    label: string,
    destructive = false,
    allowStale = false,
  ) {
    if (acting.current || dialog.current || !mounted.current || isSwitching() || (finished.current && !allowStale))
      return;
    const intent = Symbol();
    dialog.current = intent;
    setBusy(true);
    const consume = (accepted: boolean) => {
      if (!mounted.current || dialog.current !== intent) return;
      dialog.current = null;
      setBusy(false);
      if (accepted) {
        if (allowStale) void work().catch((e) => alertError('بسته نشد', e));
        else void perform(work);
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
  function keepMine() {
    const shown = comparison;
    if (!shown) return;
    confirm(
      'پیش‌نویس این صفحه نگه داشته شود؟',
      'فقط پیش‌نویس مقایسه‌شده جایگزین می‌شود؛ هنوز اندازه‌گیری‌ای ثبت نمی‌شود.',
      async () => {
        await saver.flush();
        const next = await replaceVitalFormDraft(
          persistence.id(),
          patientId,
          vitalId,
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
  function loadStored() {
    const shown = comparison;
    if (!shown) return;
    confirm(
      'بارگذاری پیش‌نویس ذخیره‌شده؟',
      'نوشتهٔ این صفحه جایگزین می‌شود؛ پیش از ادامه آن را مرور یا کپی کنید.',
      async () => {
        await saver.flush();
        const live = await inspectVitalForm(persistence.id(), patientId, vitalId, generation);
        if (live.original?.committedVitalId || !sameVitalComparison(live, shown)) throw new VitalFormConflict();
        if (live.row.draft) decodeVitalForm(live.row.draft.body);
        saver.cancel();
        onReset(live.row);
      },
      'بارگذاری',
    );
  }
  function discard() {
    confirm(
      'حذف پیش‌نویس اندازه‌گیری؟',
      'اندازه‌گیری‌های ثبت‌شده تغییر نمی‌کنند.',
      async () => {
        await flush();
        await discardVitalFormDraft(persistence.id(), patientId, vitalId, persistence.revision(), generation);
        finished.current = true;
        setCompleted('discarded');
        saver.cancel();
        closeFocused();
      },
      'حذف پیش‌نویس',
      true,
    );
  }
  function close() {
    if (generation !== datasetGeneration()) {
      confirm(
        'بستن فرم قدیمی؟',
        'پیش از بستن نوشته‌ها را مرور یا کپی کنید.',
        async () => {
          if (generation === datasetGeneration() || !navigation.isFocused()) return;
          scope?.abandonStale();
          closeFocused();
        },
        'بستن فرم',
        false,
        true,
      );
    } else
      void perform(async () => {
        await flush();
        closeFocused();
      }, true);
  }
  return {
    document,
    current: () => latest.current,
    state,
    busy,
    completed,
    failedWrite,
    comparison,
    stale,
    locked: busy || !!completed || stale || !!seed.patient.deletedAt || !!seed.vital?.deletedAt,
    hasDraft: !!seed.draft || state.status !== 'idle',
    change,
    changeDate: (patch: Partial<VitalFormFields['date']>) =>
      change({ date: { ...latest.current.fields.date, ...patch } }),
    save,
    discard,
    close,
    keepMine,
    loadStored,
    retry: () => perform(flush),
    compare: () =>
      perform(async () => {
        await saver.flush();
        setComparison(await inspectVitalForm(persistence.id(), patientId, vitalId, generation));
      }),
  };
}
