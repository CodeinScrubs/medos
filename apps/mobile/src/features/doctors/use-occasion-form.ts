import { useRouter } from 'expo-router';
import { useNavigation } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { alertError, notify } from '@/components/feedback';
import { useNow } from '@/components/use-now';
import { Autosave, type AutosaveState } from '@/lib/autosave';
import { withDatasetWrite } from '@/lib/dataset-write';
import { newId } from '@/lib/ids';

import {
  decodeOccasionForm,
  initialOccasionForm,
  OccasionFormConflict,
  occasionFormValues,
  type OccasionFormFields,
} from './occasion-form-draft';
import {
  commitOccasionFormDraft,
  discardOccasionFormDraft,
  inspectOccasionForm,
  occasionFormQuery,
  replaceOccasionFormDraft,
  saveOccasionFormDraft,
  type OccasionFormComparison,
  type OccasionFormRow,
} from './occasion-form-queries';

export function useOccasionForm(seed: OccasionFormRow, onReset: (row: OccasionFormRow) => void) {
  const scope = useAutosaveScope()!;
  const { generation, stale } = useDatasetIntent();
  const router = useRouter();
  const navigation = useNavigation();
  const now = useNow();
  const doctorId = seed.doctor.id;
  const occasionId = seed.occasion?.id ?? null;
  const [document, setDocument] = useState(() =>
    seed.draft
      ? decodeOccasionForm(seed.draft.body)
      : initialOccasionForm(seed.occasion, seed.profile?.birthDate ?? null, new Date(now)),
  );
  const latest = useRef(document);
  const acting = useRef(false);
  const pendingDialog = useRef<symbol | null>(null);
  const mounted = useRef(true);
  const published = useRef(false);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [failedWrite, setFailedWrite] = useState(false);
  const [comparison, setComparison] = useState<OccasionFormComparison | null>(null);
  const [state, setState] = useState<AutosaveState>({ status: 'idle' });
  const [persistence] = useState(() => {
    let id = seed.draft?.id ?? newId();
    let revision = seed.draft?.revision ?? 0;
    const saver = new Autosave<typeof document>({
      generation,
      onState: setState,
      shouldRetry: (e) => !(e instanceof OccasionFormConflict),
      write: async (value) => {
        revision = await saveOccasionFormDraft(id, doctorId, occasionId, value, revision, generation);
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
          return acting.current || pendingDialog.current !== null || saver.unsaved;
        },
        flush: async () => !acting.current && pendingDialog.current === null && (await saver.flush()),
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
      pendingDialog.current = null;
      sub.remove();
      void saver.flush();
    };
  }, [saver]);

  function change(patch: Partial<OccasionFormFields>) {
    if (acting.current || pendingDialog.current || published.current) return;
    const next = { ...latest.current, fields: { ...latest.current.fields, ...patch } };
    latest.current = next;
    setDocument(next);
    saver.change(next);
  }
  async function flush() {
    if (!(await saver.flush()) || saver.unsaved) throw new Error('پیش‌نویس ذخیره نشد؛ نوشته روی صفحه باقی مانده است.');
  }
  async function perform(action: () => Promise<void>) {
    if (acting.current || pendingDialog.current || !mounted.current) return;
    acting.current = true;
    setBusy(true);
    try {
      await withDatasetWrite(generation, action);
      if (mounted.current) setFailedWrite(false);
    } catch (e) {
      if (mounted.current) setFailedWrite(true);
      alertError(published.current ? 'مناسبت ثبت شد؛ صفحه بسته نشد' : 'انجام نشد', e);
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }
  function closeFocusedEditor() {
    // Permission/scheduling can outlive a deep link to another screen. A late
    // global back would pop that newer screen, not this completed editor.
    if (navigation.isFocused()) router.back();
  }
  function save() {
    return perform(async () => {
      if (!published.current) {
        try {
          occasionFormValues(latest.current, new Date(now));
        } catch (e) {
          notify('اطلاعات مناسبت کامل نیست', e instanceof Error ? e.message : 'ورودی‌ها را بررسی کنید.');
          return;
        }
        saver.change(latest.current);
        await flush();
        const result = await commitOccasionFormDraft(
          persistence.id(),
          doctorId,
          occasionId,
          persistence.revision(),
          new Date(now),
          generation,
        );
        published.current = true;
        setCompleted(true);
        saver.cancel();
        if (result.reminderPending)
          notify('مناسبت ذخیره شد', 'یادآور هماهنگ نشد؛ از صفحهٔ پزشک «هماهنگی اعلان؛ تلاش مجدد» را بزنید.');
      }
      acting.current = false;
      closeFocusedEditor();
    });
  }
  function keepMine() {
    if (!comparison) return Promise.resolve();
    return perform(async () => {
      await saver.flush();
      const next = await replaceOccasionFormDraft(
        persistence.id(),
        doctorId,
        occasionId,
        latest.current,
        comparison,
        generation,
      );
      persistence.adopt(next.id, next.revision);
      latest.current = next.document;
      setDocument(next.document);
      saver.change(next.document);
      await flush();
      setComparison(null);
    });
  }
  function confirm(
    title: string,
    message: string,
    action: () => Promise<void>,
    options: { destructive?: boolean; label?: string; allowStale?: boolean } = {},
  ) {
    if (acting.current || pendingDialog.current || !mounted.current) return;
    const intent = Symbol();
    pendingDialog.current = intent;
    setBusy(true);
    const consume = (accepted: boolean) => {
      if (!mounted.current || pendingDialog.current !== intent) return;
      pendingDialog.current = null;
      setBusy(false);
      if (accepted) {
        if (options.allowStale) void action().catch((e) => alertError('بسته نشد', e));
        else void perform(action);
      }
    };
    Alert.alert(
      title,
      message,
      [
        { text: 'انصراف', style: 'cancel', onPress: () => consume(false) },
        {
          text: options.label ?? (options.destructive ? 'حذف پیش‌نویس' : 'بارگذاری'),
          style: options.destructive ? 'destructive' : 'default',
          onPress: () => consume(true),
        },
      ],
      { cancelable: true, onDismiss: () => consume(false) },
    );
  }
  function loadStored() {
    confirm(
      'بارگذاری نسخهٔ ذخیره‌شده؟',
      'نوشتهٔ روی این صفحه جایگزین می‌شود؛ پیش از ادامه آن را مرور یا کپی کنید.',
      async () => {
        // Wait for an in-flight write before adopting a different draft. The
        // owner explicitly chose replacement even if the local write fails.
        await saver.flush();
        const row = occasionFormQuery(doctorId, occasionId).get();
        if (!row) throw new OccasionFormConflict();
        saver.cancel();
        acting.current = false;
        onReset(row);
      },
    );
  }
  function discard() {
    confirm(
      'حذف پیش‌نویس؟',
      'مناسبت ثبت‌شده تغییر نمی‌کند؛ فقط نوشتهٔ این فرم کنار گذاشته می‌شود.',
      async () => {
        await flush();
        await discardOccasionFormDraft(persistence.id(), doctorId, occasionId, persistence.revision(), generation);
        published.current = true;
        saver.cancel();
        acting.current = false;
        closeFocusedEditor();
      },
      { destructive: true },
    );
  }
  function close() {
    if (acting.current || pendingDialog.current) return;
    if (!stale) {
      closeFocusedEditor();
      return;
    }
    confirm(
      'بستن فرم قدیمی؟',
      'پیش از بستن نوشته‌های روی صفحه را مرور یا کپی کنید.',
      async () => {
        scope.abandonStale();
        closeFocusedEditor();
      },
      { label: 'بستن فرم', allowStale: true },
    );
  }
  return {
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
    hasDraft: !!seed.draft || state.status !== 'idle',
    retry: () => perform(flush),
    compare: () =>
      perform(async () => {
        await saver.flush();
        setComparison(await inspectOccasionForm(persistence.id(), doctorId, occasionId, generation));
      }),
  };
}
