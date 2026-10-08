import { useRouter } from 'expo-router';
import { useNavigation } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';

import { useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { EditGate } from '@/components/edit-gate';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, Screen, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { assertDatasetWrite, datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';

/** Feature-local retention for the remaining manual forms; this is not a durable draft. */
export function ManualDoctorGate<T>({
  query,
  creating = false,
  what,
  children,
}: {
  query: Parameters<typeof useLive<T>>[0];
  creating?: boolean;
  what: string;
  children: (seed: T | null, notice: ReactNode, generation: number, unavailable: boolean) => ReactNode;
}) {
  const { generation, stale } = useDatasetIntent();
  const closing = useManualDoctorClose(generation);
  const live = useLive(query);
  const [retained, setRetained] = useState<T | null | undefined>(() => (creating ? null : undefined));
  if (!stale && retained === undefined && live.data?.[0]) setRetained(live.data[0]);
  if (stale && retained === undefined)
    return (
      <Screen scroll>
        <Text color="danger">اطلاعات از بکاپ جایگزین شد؛ فرم را دوباره باز کنید.</Text>
        <Button label="بستن" disabled={closing.pending} onPress={closing.close} />
      </Screen>
    );
  const unavailable = !creating && !!retained && !live.error && live.data?.length === 0;
  return (
    <EditGate
      editing={!creating}
      rows={retained ? [retained] : live.data}
      error={live.error}
      onRetry={live.retry}
      what={what}
      fenceDataset
    >
      {(seed, notice) =>
        children(
          seed,
          <>
            {notice}
            {creating ? <ErrorNotice error={live.error} what={what} onRetry={live.retry} /> : null}
            {unavailable ? <Text color="danger">اطلاعات دیگر در دسترس نیست؛ نوشتهٔ این فرم حفظ شده است.</Text> : null}
          </>,
          generation,
          unavailable,
        )
      }
    </EditGate>
  );
}

/** Stale close abandons local intent only after confirmation on the original mounted route. */
function useManualDoctorClose(generation: number, blocked: () => boolean = () => false) {
  const scope = useAutosaveScope()!;
  const router = useRouter();
  const navigation = useNavigation();
  const dialog = useRef<symbol | null>(null);
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      dialog.current = null;
    };
  }, []);
  function close() {
    if (blocked() || dialog.current || !mounted.current || !navigation.isFocused()) return;
    if (generation === datasetGeneration()) {
      router.back();
      return;
    }
    const intent = Symbol();
    dialog.current = intent;
    setPending(true);
    const consume = (accepted: boolean) => {
      if (!mounted.current || dialog.current !== intent) return;
      dialog.current = null;
      setPending(false);
      if (!accepted || blocked() || !navigation.isFocused() || generation === datasetGeneration()) return;
      try {
        scope.abandonStale();
        router.back();
      } catch (error) {
        alertError('بسته نشد', error);
      }
    };
    Alert.alert(
      'بستن فرم قدیمی؟',
      'پیش از بستن نوشته‌های روی صفحه را مرور یا کپی کنید؛ اطلاعات بازگردانی‌شده تغییر نمی‌کند.',
      [
        { text: 'ادامهٔ مرور', style: 'cancel', onPress: () => consume(false) },
        { text: 'بستن فرم', onPress: () => consume(true) },
      ],
      { cancelable: true, onDismiss: () => consume(false) },
    );
  }
  const isPending = useCallback(() => dialog.current !== null, []);
  return { close, pending, isPending };
}

/** Only in-flight manual work is guarded. Unsubmitted raw fields are still process-local. */
export function useManualDoctorForm<F extends object>(initial: F, generation: number, unavailable: boolean) {
  const scope = useAutosaveScope()!;
  const { stale } = useDatasetIntent(generation);
  const [fields, setFields] = useState(initial);
  const [basis] = useState(initial);
  const latest = useRef(fields);
  const acting = useRef(false);
  const published = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const closing = useManualDoctorClose(generation, () => acting.current);
  const { isPending } = closing;
  useEffect(
    () =>
      scope.group.register({
        get unsaved() {
          return acting.current || isPending();
        },
        flush: async () => !acting.current && !isPending(),
      }),
    [scope, isPending],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function change(patch: Partial<F> | ((current: F) => Partial<F>)) {
    if (
      acting.current ||
      closing.isPending() ||
      published.current ||
      generation !== datasetGeneration() ||
      unavailable ||
      !mounted.current
    )
      return;
    const next = { ...latest.current, ...(typeof patch === 'function' ? patch(latest.current) : patch) };
    latest.current = next;
    setFields(next);
  }
  async function inline<T>(work: () => Promise<T>): Promise<T> {
    assertDatasetWrite(generation);
    if (acting.current || closing.isPending() || published.current || !mounted.current || unavailable)
      throw new Error('این فرم در حال ذخیره است یا دیگر قابل ویرایش نیست.');
    acting.current = true;
    setBusy(true);
    try {
      return await withDatasetWrite(generation, work);
    } finally {
      acting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function submit(work: (current: F) => Promise<boolean>) {
    if (acting.current || closing.isPending() || published.current || !mounted.current || unavailable) return;
    acting.current = true;
    setBusy(true);
    try {
      const saved = await withDatasetWrite(generation, async () => {
        const acknowledged = await work(latest.current);
        if (acknowledged) {
          published.current = true;
          if (mounted.current) setCompleted(true);
        }
        return acknowledged;
      });
      if (saved) {
        acting.current = false;
        closing.close();
      }
    } catch (error) {
      alertError('ذخیره نشد', error);
    } finally {
      acting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    fields,
    basis,
    change,
    inline,
    submit,
    close: closing.close,
    busy: busy || closing.pending,
    completed,
    locked: busy || closing.pending || completed || stale || unavailable,
  };
}
