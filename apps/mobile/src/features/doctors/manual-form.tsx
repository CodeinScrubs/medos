import { useRouter } from 'expo-router';
import { useNavigation } from 'expo-router/react-navigation';
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, AppState } from 'react-native';

import { useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { EditGate } from '@/components/edit-gate';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, Card, Column, Screen, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { Autosave, type AutosaveState } from '@/lib/autosave';
import { assertDatasetWrite, datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { newId } from '@/lib/ids';

import { DoctorFormConflict } from './edit-basis';
import {
  decodeDoctorForm,
  initialDoctorForm,
  type DoctorFormDocument,
  type DoctorFormDocumentFor,
  type DoctorFormFieldsFor,
  type DoctorFormKind,
} from './form-draft';
import {
  commitDoctorFormDraft,
  discardDoctorFormDraft,
  doctorFormDocumentContext,
  doctorFormMatchesComparison,
  doctorFormQuery,
  inspectDoctorForm,
  replaceDoctorFormDraft,
  saveDoctorFormDraft,
  type DoctorFormComparison,
  type DoctorFormRow,
} from './form-draft-queries';

/** Read the parent, optional profile and raw draft once before any editor is mounted. */
export function ManualDoctorGate({
  kind,
  doctorId,
  what,
  children,
}: {
  kind: DoctorFormKind;
  doctorId: string | null;
  what: string;
  children: (
    seed: DoctorFormRow,
    notice: ReactNode,
    generation: number,
    unavailable: boolean,
    onReset: (row: DoctorFormRow) => void,
  ) => ReactNode;
}) {
  const { generation, stale } = useDatasetIntent();
  const closing = useManualDoctorClose(generation);
  const live = useLive(doctorFormQuery(kind, doctorId), [kind, doctorId]);
  const [retained, setRetained] = useState<DoctorFormRow>();
  const [reset, setReset] = useState(0);
  if (!stale && !retained && live.data?.[0]) setRetained(live.data[0]);
  const rows = retained ? [retained] : live.data;
  let invalid: Error | undefined;
  if (rows?.[0]?.draft) {
    try {
      if (
        rows[0].draft.kind !== kind ||
        rows[0].draft.doctorId !== doctorId ||
        rows[0].draft.scope !== (doctorId ?? 'new')
      )
        throw new DoctorFormConflict();
      doctorFormDocumentContext(decodeDoctorForm(rows[0].draft.body), kind, doctorId);
    } catch (error) {
      invalid = error instanceof Error ? error : new Error('پیش‌نویس خوانده نشد.');
    }
  }
  if (invalid || (stale && !retained))
    return (
      <Screen scroll>
        <ErrorNotice error={invalid} what="پیش‌نویس پزشک" />
        {stale ? <Text color="danger">اطلاعات از بکاپ جایگزین شد؛ فرم را دوباره باز کنید.</Text> : null}
        <Text selectable>{rows?.[0]?.draft?.body}</Text>
        <Button label="بستن" disabled={closing.pending} onPress={closing.close} />
      </Screen>
    );
  const unavailable =
    !!doctorId && !!retained && !live.error && (live.data?.length === 0 || !!live.data?.[0]?.doctor?.deletedAt);
  return (
    <EditGate editing rows={rows} error={live.error} onRetry={live.retry} what={what} fenceDataset>
      {(seed, notice) =>
        seed ? (
          <Fragment key={reset}>
            {children(
              seed,
              <>
                {notice}
                {unavailable ? <Text color="danger">پزشک در دسترس نیست؛ نوشتهٔ این فرم حفظ شده است.</Text> : null}
              </>,
              generation,
              unavailable,
              (next) => {
                setRetained(next);
                setReset((n) => n + 1);
              },
            )}
          </Fragment>
        ) : null
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

/** Three feature-local raw documents reuse one original intent and the existing autosave scope. */
export function useManualDoctorForm<K extends DoctorFormKind>(
  kind: K,
  seed: DoctorFormRow,
  generation: number,
  unavailable: boolean,
  onReset: (row: DoctorFormRow) => void,
) {
  const scope = useAutosaveScope()!;
  const { stale } = useDatasetIntent(generation);
  const doctorId = seed.doctor?.id ?? null;
  const [document, setDocument] = useState<DoctorFormDocumentFor<K>>(() => {
    if (!seed.draft) return initialDoctorForm(kind, seed.doctor, seed.profile);
    const stored = decodeDoctorForm(seed.draft.body);
    doctorFormDocumentContext(stored, kind, doctorId);
    return stored as DoctorFormDocumentFor<K>;
  });
  const latest = useRef(document);
  const acting = useRef(false);
  const published = useRef(false);
  const mounted = useRef(true);
  const dialog = useRef<symbol | null>(null);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState<'saved' | 'discarded' | null>(null);
  const [failedWrite, setFailedWrite] = useState(false);
  const [comparison, setComparison] = useState<DoctorFormComparison | null>(null);
  const [state, setState] = useState<AutosaveState>({ status: 'idle' });
  const [persistence] = useState(() => {
    let id = seed.draft?.id ?? newId();
    let revision = seed.draft?.revision ?? 0;
    const saver = new Autosave<DoctorFormDocumentFor<K>>({
      generation,
      onState: setState,
      shouldRetry: (error) => !(error instanceof DoctorFormConflict),
      write: async (value) => {
        revision = await saveDoctorFormDraft(id, kind, doctorId, value, revision, generation);
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
  const closing = useManualDoctorClose(generation, () => acting.current || dialog.current !== null);
  const { isPending } = closing;
  useEffect(
    () =>
      scope.group.register({
        get unsaved() {
          return acting.current || dialog.current !== null || isPending() || saver.unsaved;
        },
        flush: async () => !acting.current && dialog.current === null && !isPending() && (await saver.flush()),
      }),
    [scope, saver, isPending],
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
  function change(
    patch: Partial<DoctorFormFieldsFor<K>> | ((current: DoctorFormFieldsFor<K>) => Partial<DoctorFormFieldsFor<K>>),
  ) {
    if (
      acting.current ||
      closing.isPending() ||
      dialog.current ||
      published.current ||
      generation !== datasetGeneration() ||
      unavailable ||
      !mounted.current
    )
      return;
    const fields = {
      ...latest.current.fields,
      ...(typeof patch === 'function' ? patch(latest.current.fields as DoctorFormFieldsFor<K>) : patch),
    };
    const next = { ...latest.current, fields } as DoctorFormDocumentFor<K>;
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
      closing.isPending() ||
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
    } catch (error) {
      if (mounted.current) setFailedWrite(true);
      alertError('ذخیره نشد', error);
    } finally {
      acting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function inline<T>(work: () => Promise<T>): Promise<T> {
    assertDatasetWrite(generation);
    if (acting.current || closing.isPending() || dialog.current || published.current || !mounted.current || unavailable)
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
  async function submit(validate: ((current: DoctorFormFieldsFor<K>) => boolean) | undefined, now: Date) {
    if (unavailable) return;
    return perform(async () => {
      if (!published.current) {
        saver.change(latest.current);
        await flush();
        if (validate && !validate(latest.current.fields as DoctorFormFieldsFor<K>)) return;
        await commitDoctorFormDraft(persistence.id(), kind, doctorId, persistence.revision(), now, generation);
        published.current = true;
        if (mounted.current) setCompleted('saved');
        saver.cancel();
      }
      acting.current = false;
      closing.close();
    }, true);
  }
  function confirm(title: string, message: string, action: () => Promise<void>, label: string, destructive = false) {
    if (acting.current || closing.isPending() || dialog.current || published.current || !mounted.current) return;
    const intent = Symbol();
    dialog.current = intent;
    setBusy(true);
    const consume = (accepted: boolean) => {
      if (!mounted.current || dialog.current !== intent) return;
      dialog.current = null;
      setBusy(false);
      if (accepted) void perform(action);
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
        const current = await inspectDoctorForm(persistence.id(), kind, doctorId, generation);
        if (current.original?.committedEntityId || !doctorFormMatchesComparison(kind, current.row, shown.row))
          throw new DoctorFormConflict();
        if (current.row.draft) doctorFormDocumentContext(decodeDoctorForm(current.row.draft.body), kind, doctorId);
        saver.cancel();
        acting.current = false;
        onReset(current.row);
      },
      'بارگذاری',
    );
  }
  function keepMine() {
    const shown = comparison;
    if (!shown) return;
    confirm(
      'پیش‌نویس این صفحه نگه داشته شود؟',
      'فقط تغییرهای این صفحه روی اطلاعات نمایش‌داده‌شده اعمال می‌شود؛ هنوز چیزی منتشر نمی‌شود.',
      async () => {
        await saver.flush();
        const next = await replaceDoctorFormDraft(persistence.id(), kind, doctorId, latest.current, shown, generation);
        persistence.adopt(next.id, next.revision);
        latest.current = next.document as DoctorFormDocumentFor<K>;
        setDocument(latest.current);
        saver.change(latest.current);
        await flush();
        setComparison(null);
      },
      'نگه‌داشتن نسخهٔ من',
    );
  }
  function discard() {
    confirm(
      'حذف پیش‌نویس؟',
      'فقط نوشتهٔ منتشرنشدهٔ این فرم کنار گذاشته می‌شود؛ اطلاعات ثبت‌شده تغییر نمی‌کند.',
      async () => {
        await flush();
        await discardDoctorFormDraft(persistence.id(), kind, doctorId, persistence.revision(), generation);
        published.current = true;
        if (mounted.current) setCompleted('discarded');
        saver.cancel();
        acting.current = false;
        closing.close();
      },
      'حذف پیش‌نویس',
      true,
    );
  }
  return {
    fields: document.fields as DoctorFormFieldsFor<K>,
    change,
    inline,
    submit,
    close: closing.close,
    busy: busy || closing.pending,
    completed,
    locked: busy || closing.pending || !!completed || stale || unavailable,
    state,
    comparison,
    failedWrite,
    stale,
    hasDraft: !!seed.draft || state.status !== 'idle',
    loadStored,
    keepMine,
    discard,
    retry: () => perform(flush),
    compare: () =>
      perform(async () => {
        await saver.flush();
        setComparison(await inspectDoctorForm(persistence.id(), kind, doctorId, generation));
      }),
  };
}

/** Failure-only recovery stays out of the ordinary publication path. */
export function DoctorDraftNotice({
  editing,
  recovered,
}: {
  editing: Pick<
    ReturnType<typeof useManualDoctorForm>,
    | 'state'
    | 'completed'
    | 'stale'
    | 'locked'
    | 'comparison'
    | 'failedWrite'
    | 'retry'
    | 'compare'
    | 'loadStored'
    | 'keepMine'
  >;
  recovered: boolean;
}) {
  const { state, completed, stale, locked, comparison } = editing;
  let stored: ReturnType<typeof decodeDoctorForm> | null = null;
  try {
    if (comparison?.row.draft) stored = decodeDoctorForm(comparison.row.draft.body);
  } catch {
    /* Show raw bytes without replacing them. */
  }
  return (
    <>
      <Text variant="tiny" color={state.status === 'failed' ? 'danger' : 'textMuted'}>
        {completed === 'saved'
          ? 'ذخیره شد؛ برای برگشت، «بستن» را بزنید.'
          : completed === 'discarded'
            ? 'پیش‌نویس کنار گذاشته شد.'
            : state.status === 'failed'
              ? 'پیش‌نویس ذخیره نشد؛ نوشته روی صفحه باقی مانده است.'
              : state.status === 'pending' || state.status === 'writing'
                ? 'در حال ذخیرهٔ پیش‌نویس…'
                : state.status === 'saved'
                  ? 'پیش‌نویس ذخیره شد.'
                  : recovered
                    ? 'پیش‌نویس بازیابی شد.'
                    : 'نوشته‌ها خودکار در پیش‌نویس ذخیره می‌شوند.'}
      </Text>
      {state.status === 'failed' && !stale ? (
        <Button label="ذخیره نشد؛ تلاش دوباره" variant="ghost" disabled={locked} onPress={() => void editing.retry()} />
      ) : null}
      {(editing.failedWrite || state.status === 'failed') && !completed && !stale ? (
        <Button
          label="بررسی پیش‌نویس ذخیره‌شده"
          variant="ghost"
          disabled={locked}
          onPress={() => void editing.compare()}
        />
      ) : null}
      {comparison ? (
        <Card>
          <Column gap="sm">
            <Text variant="bodyStrong">اطلاعات فعلی و پیش‌نویس ذخیره‌شده</Text>
            {comparison.row.doctor && stored?.kind !== 'rating' ? (
              <>
                <Text variant="bodyStrong">اطلاعات ثبت‌شدهٔ فعلی</Text>
                <DraftFields
                  document={initialDoctorForm(
                    stored?.kind ?? comparison.row.draft?.kind ?? 'directory',
                    comparison.row.doctor,
                    comparison.row.profile,
                  )}
                />
              </>
            ) : null}
            <Text variant="bodyStrong">پیش‌نویس ذخیره‌شده</Text>
            {stored ? (
              <DraftFields document={stored} />
            ) : (
              <Text selectable>{comparison.row.draft?.body ?? 'پیش‌نویس باز دیگری ثبت نشده است.'}</Text>
            )}
            <Button
              label="بارگذاری پیش‌نویس ذخیره‌شده"
              variant="ghost"
              disabled={locked}
              onPress={editing.loadStored}
            />
            {stored || !comparison.row.draft ? (
              <Button label="نگه‌داشتن نسخهٔ من" variant="ghost" disabled={locked} onPress={editing.keepMine} />
            ) : null}
          </Column>
        </Card>
      ) : null}
    </>
  );
}

/** Keep the first autosave acknowledgment from inserting a control above the active input. */
export function DoctorDraftDiscard({
  editing,
}: {
  editing: Pick<ReturnType<typeof useManualDoctorForm>, 'hasDraft' | 'completed' | 'stale' | 'locked' | 'discard'>;
}) {
  return editing.hasDraft && !editing.completed && !editing.stale ? (
    <Button label="حذف پیش‌نویس" variant="ghost" disabled={editing.locked} onPress={editing.discard} />
  ) : null;
}

const FIELD_LABELS: Record<string, string> = {
  title: 'عنوان',
  firstName: 'نام',
  lastName: 'نام خانوادگی',
  academicRank: 'مرتبهٔ دانشگاهی',
  relationship: 'نسبت',
  specialtyId: 'تخصص',
  subspecialtyId: 'فوق تخصص',
  specialtyText: 'عنوان تخصص روی کارت',
  phone: 'موبایل',
  phoneAlt: 'موبایل دوم',
  whatsapp: 'واتساپ',
  telegram: 'تلگرام',
  email: 'ایمیل',
  extension: 'داخلی',
  primaryPlaceId: 'محل اصلی',
  officeAddress: 'آدرس مطب',
  officeHours: 'ساعت کار مطب',
  officePhone: 'تلفن مطب',
  acceptsReferrals: 'پذیرش ارجاع',
  visitFee: 'هزینهٔ ویزیت',
  insurances: 'بیمه‌ها',
  referralNotes: 'یادداشت ارجاع',
  tags: 'برچسب‌ها',
  notes: 'یادداشت',
  starred: 'نشان‌دار',
  birthDate: 'تاریخ تولد',
  hometown: 'زادگاه',
  almaMater: 'دانشگاه',
  graduationYear: 'سال فارغ‌التحصیلی',
  familyNotes: 'خانواده',
  interests: 'علایق',
  favoriteTopics: 'موضوع‌های مورد علاقه',
  dislikes: 'چیزهایی که خوشش نمی‌آید',
  howWeMet: 'چطور آشنا شدیم',
  memorableMoments: 'خاطره‌ها',
  communicationStyle: 'سبک ارتباط',
  personalNotes: 'یادداشت شخصی',
  reasoning: 'دلیل و توضیح',
  knowledge: 'دانش',
  orientation: 'به‌روز بودن',
  patientRapport: 'برخورد با بیمار',
  emergencyResponsiveness: 'پاسخگویی اورژانسی',
  contactOpenness: 'استقبال از تماس',
  teaching: 'آموزش',
};
function DraftFields({ document }: { document: DoctorFormDocument }) {
  const fields =
    document.kind === 'rating' ? { ...document.fields.scores, reasoning: document.fields.reasoning } : document.fields;
  return (
    <>
      {Object.entries(fields).map(([key, value]) =>
        value !== '' && value != null && !['specialtyId', 'subspecialtyId', 'primaryPlaceId'].includes(key) ? (
          <Text key={key} selectable>
            {FIELD_LABELS[key]}: {typeof value === 'boolean' ? (value ? 'بله' : 'خیر') : String(value)}
          </Text>
        ) : null,
      )}
    </>
  );
}
