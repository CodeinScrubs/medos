import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from 'expo-router/react-navigation';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, AppState, View } from 'react-native';

import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { EditGate } from '@/components/edit-gate';
import { ErrorNotice } from '@/components/error-notice';
import { alertError, notify } from '@/components/feedback';
import { PickerModal, type PickerItem } from '@/components/picker-modal';
import { QuickDateField } from '@/components/quick-date-field';
import { ScreenOptions } from '@/components/screen-options';
import {
  Button,
  ChipSelect,
  Column,
  EmptyState,
  IconButton,
  Input,
  Row,
  Screen,
  SectionHeader,
  SelectField,
  Text,
  Toggle,
} from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import { useNow } from '@/components/use-now';
import { VoiceNotePlayer } from '@/components/voice-note-player';
import { NOTE_TYPES, type Note, type NoteDraft, type NoteType } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { VoiceNotesSection } from '@/features/attachments/voice-notes';
import { doctorDisplayName } from '@/features/doctors/logic';
import { doctorsQuery, quickCreateDoctor } from '@/features/doctors/queries';
import { activeEncounterIdQuery } from '@/features/encounters/status';
import { patientQuery } from '@/features/patients/queries';
import { Autosave, type AutosaveState } from '@/lib/autosave';
import { DatasetChangedError, datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import type { DateTimeInput } from '@/lib/date-input';
import { newId } from '@/lib/ids';
import { fullName } from '@/lib/persian';
import { mediaUri } from '@/platform/media';
import { useTheme } from '@/theme';

import { commitNoteDraft } from './commit-queries';
import {
  decodeNoteOrigin,
  initialNoteOrigin,
  matchesNoteOrigin,
  noteDateInput,
  NoteDraftConflict,
  type NoteDraftOrigin,
} from './draft-context';
import {
  adoptNoteDraftOrigin,
  discardNoteDraft,
  draftHasContent,
  draftHasSavedVoice,
  inspectNoteDraft,
  noteDraftQuery,
  writeNoteDraft,
  type NoteDraftFields,
  type NoteDraftComparison,
} from './draft-queries';
import { NoteDraftReview } from './draft-review';
import { NOTE_TYPE_LABELS } from './labels';
import { CONSULT_NOTE_TYPES, SOAP_NOTE_TYPES } from './logic';
import { latestPatientNoteQuery, noteQuery } from './queries';

/**
 * SOAP fields for the note types actually written that way; a single body for
 * everything else. Forcing SOAP onto a one-line phone follow-up is friction.
 *
 * Nothing typed here waits for the save button. Every change goes to a draft
 * row a few seconds behind the keyboard (`lib/autosave.ts`), and a recording
 * is copied into storage and acknowledged in that draft when it stops. The note itself is still written
 * once, when the user says so: a chart entry is a decision, not a side effect
 * of typing. What the save button controls is what enters the record — not
 * whether the words survive.
 */

const TYPE_OPTIONS = NOTE_TYPES.map((t) => ({ value: t, label: NOTE_TYPE_LABELS[t] }));

/** Create or edit a note. Recovery may select one exact `draftId`. */
export function NoteEditorScreen() {
  const {
    id: patientId,
    noteId,
    type,
    draftId,
  } = useLocalSearchParams<{
    id: string;
    noteId?: string;
    type?: string;
    draftId?: string;
  }>();
  const [context] = useState(() => ({ patientId: patientId ?? '', noteId, type, draftId }));
  const contextChanged =
    context.patientId !== (patientId ?? '') || context.noteId !== noteId || context.draftId !== draftId;
  return (
    <AutosaveScope>
      <NoteGate {...context} contextChanged={contextChanged} />
    </AutosaveScope>
  );
}

function NoteGate({
  patientId,
  noteId,
  type,
  draftId,
  contextChanged,
}: {
  patientId: string;
  noteId?: string;
  type?: string;
  draftId?: string;
  contextChanged: boolean;
}) {
  const { data, error, retry } = useLive(noteQuery(noteId ?? '', patientId), [noteId, patientId]);
  const { data: parentRows, error: parentError, retry: retryParent } = useLive(patientQuery(patientId), [patientId]);
  const {
    data: activeRows,
    error: activeError,
    retry: retryActive,
  } = useLive(activeEncounterIdQuery(patientId), [patientId]);
  const { stale } = useDatasetIntent();
  const { colors, spacing } = useTheme();
  const [seed, setSeed] = useState<Note | undefined>(() => data?.[0]);
  const [hasParent, setHasParent] = useState(() => Boolean(parentRows?.[0]));
  const [originalEncounter, setOriginalEncounter] = useState<string | null | undefined>(() =>
    activeRows === undefined || activeError ? undefined : (activeRows[0]?.id ?? null),
  );
  if (!stale && originalEncounter === undefined && activeRows !== undefined && !activeError)
    setOriginalEncounter(activeRows[0]?.id ?? null);
  if (!stale && !hasParent && parentRows?.[0]) setHasParent(true);
  if (!stale && seed === undefined && data?.[0]) setSeed(data[0]);
  const unavailable =
    parentRows === undefined ||
    !parentRows[0] ||
    Boolean(parentError || error) ||
    (Boolean(noteId) && (data === undefined || !data[0]));
  if (!hasParent && unavailable && !noteId) {
    return (
      <Screen>
        {parentError ? (
          <ErrorNotice error={parentError} what="پرونده" onRetry={retryParent} />
        ) : parentRows === undefined ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.huge }} />
        ) : (
          <EmptyState title="پرونده در دسترس نیست" icon="alert-circle-outline" />
        )}
      </Screen>
    );
  }
  // The type comes from the URL, so it is checked rather than trusted.
  if (!noteId && originalEncounter === undefined)
    return (
      <Screen>
        {activeError ? (
          <ErrorNotice error={activeError} what="بستری" onRetry={retryActive} />
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.huge }} />
        )}
      </Screen>
    );
  const initialType = NOTE_TYPES.find((t) => t === type) ?? 'progress';
  return (
    <EditGate
      editing={Boolean(noteId)}
      rows={seed ? [seed] : data}
      error={error}
      onRetry={retry}
      what="نوت"
      fenceDataset
    >
      {(note, readNotice, generation) => (
        <DraftGate
          patientId={patientId}
          requestedDraftId={draftId}
          note={note}
          currentNote={data?.[0] ?? null}
          encounterId={originalEncounter ?? null}
          patientLabel={parentRows?.[0] ? fullName(parentRows[0].firstName, parentRows[0].lastName) : ''}
          initialType={initialType}
          retryNote={() => {
            retry();
            retryParent();
          }}
          generation={generation}
          readNotice={
            <>
              {readNotice}
              <ErrorNotice error={parentError} what="پرونده" onRetry={retryParent} />
            </>
          }
          contextChanged={contextChanged}
          unavailable={unavailable}
        />
      )}
    </EditGate>
  );
}

/**
 * Wait for the draft to be read before the fields exist.
 *
 * Only the first answer is used. The query stays live because the editor
 * writes to that same row, and re-reading its own writes into the form would
 * fight the keyboard.
 */
function DraftGate({
  patientId,
  requestedDraftId,
  note,
  currentNote,
  encounterId,
  patientLabel,
  initialType,
  retryNote,
  generation,
  readNotice,
  contextChanged,
  unavailable,
}: {
  patientId: string;
  requestedDraftId?: string;
  note: Note | null;
  currentNote: Note | null;
  encounterId: string | null;
  patientLabel: string;
  initialType: NoteType;
  retryNote: () => void;
  generation: number;
  readNotice: ReactNode;
  contextChanged: boolean;
  unavailable: boolean;
}) {
  const { colors, spacing } = useTheme();
  const { data, error, retry } = useLive(noteDraftQuery(patientId, note?.id ?? null, requestedDraftId), [
    patientId,
    note?.id,
    requestedDraftId,
  ]);
  const [seed, setSeed] = useState<NoteDraft | null | undefined>(() =>
    data === undefined || (requestedDraftId !== undefined && !data[0]) ? undefined : (data[0] ?? null),
  );
  if (
    seed === undefined &&
    data !== undefined &&
    (requestedDraftId === undefined || data[0]) &&
    generation === datasetGeneration()
  )
    setSeed(data[0] ?? null);

  if (seed === undefined) {
    return (
      <Screen>
        {error ? (
          <ErrorNotice error={error} what="پیش‌نویس نوت" onRetry={retry} />
        ) : requestedDraftId !== undefined && data !== undefined ? (
          <EmptyState title="پیش‌نویس در دسترس نیست" icon="alert-circle-outline" />
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.huge }} />
        )}
      </Screen>
    );
  }
  // The editor reads this once, when it mounts. Later versions of the row are
  // its own writes coming back, and must not be pushed into the fields.
  return (
    <NoteEditor
      patientId={patientId}
      note={note}
      currentNote={currentNote}
      encounterId={encounterId}
      patientLabel={patientLabel}
      initialType={initialType}
      draft={seed}
      readError={error}
      retryRead={() => {
        retryNote();
        retry();
      }}
      generation={generation}
      readNotice={readNotice}
      contextChanged={contextChanged}
      unavailable={unavailable || Boolean(requestedDraftId !== undefined && !data?.[0])}
    />
  );
}

function fieldsOf(note: Note | null, draft: NoteDraft | null, initialType: NoteType, now: Date): NoteDraftFields {
  const source = draft ?? note;
  return {
    type: source?.type ?? initialType,
    title: source?.title ?? null,
    body: source?.body ?? null,
    subjective: source?.subjective ?? null,
    objective: source?.objective ?? null,
    assessment: source?.assessment ?? null,
    plan: source?.plan ?? null,
    noteDate: source?.noteDate ?? now,
    rawDate: noteDateInput(draft?.rawDate, source?.noteDate ?? now),
    doctorId: source?.doctorId ?? null,
    specialty: source?.specialty ?? null,
    isPinned: source?.isPinned ?? false,
    isDraft: source?.isDraft ?? false,
    voices: draft?.voices ?? [],
  };
}

function NoteEditor({
  patientId,
  note,
  currentNote,
  encounterId,
  patientLabel: label,
  initialType,
  draft,
  readError,
  retryRead,
  generation,
  readNotice,
  contextChanged,
  unavailable,
}: {
  patientId: string;
  note: Note | null;
  currentNote: Note | null;
  encounterId: string | null;
  patientLabel: string;
  initialType: NoteType;
  draft: NoteDraft | null;
  readError?: Error;
  retryRead: () => void;
  generation: number;
  readNotice: ReactNode;
  contextChanged: boolean;
  unavailable: boolean;
}) {
  const router = useRouter();
  const navigation = useNavigation();
  const now = useNow();
  const { stale } = useDatasetIntent(generation);
  const { colors, spacing } = useTheme();
  const isEdit = note != null;
  const [patientLabel] = useState(label);
  // Both read the draft as it was on mount: the row changes underneath as this
  // screen writes to it, and neither answer should change with it.
  const [recovered] = useState(() => draft != null && (draftHasContent(draft) || draftHasSavedVoice(draft.id)));
  const [draftId] = useState(() => draft?.id ?? newId());
  const [fields, setFields] = useState<NoteDraftFields>(() => fieldsOf(note, draft, initialType, new Date(now)));
  const [origin, setOrigin] = useState<NoteDraftOrigin | null>(() => {
    if (!draft) return initialNoteOrigin(patientId, note, encounterId);
    try {
      return draft.origin ? decodeNoteOrigin(draft.origin) : null;
    } catch {
      return null;
    }
  });
  const originRef = useRef(origin);
  const [comparison, setComparison] = useState<NoteDraftComparison | null>(null);
  const reviewAttempt = useRef<symbol | null>(null);
  // The scheduler reads this, not React state: it runs from timers, where a
  // stale closure would write an older version of the note over a newer one.
  const latest = useRef(fields);
  const [autosave, setAutosave] = useState<AutosaveState>({ status: 'idle' });

  const [pickingDoctor, setPickingDoctor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);
  const committing = useRef(false);
  const dateValidation = useDateValidation();
  const mounted = useRef(true);
  const latestNote = useRef(currentNote);
  const contextValid = useRef(!contextChanged && !unavailable && !readError);
  useLayoutEffect(() => {
    contextValid.current = !contextChanged && !unavailable && !readError;
    latestNote.current = currentNote;
  }, [contextChanged, unavailable, readError, currentNote]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      reviewAttempt.current = null;
    };
  }, []);
  const needsReview = !matchesNoteOrigin(origin, currentNote);
  const contextLocked = saving || stale || contextChanged || unavailable || Boolean(readError);
  const locked = contextLocked || needsReview;
  function requireContext() {
    if (!mounted.current || !contextValid.current)
      throw new Error('نوت یا مسیر پرونده تغییر کرده است؛ نوشتهٔ این فرم باقی مانده.');
  }

  const [persistence] = useState(() => {
    let writingOrigin = origin;
    let writingRevision = draft?.revision ?? 0;
    const saver = new Autosave<NoteDraftFields>({
      write: async (value) => {
        writingRevision = await writeNoteDraft(
          draftId,
          { patientId, noteId: note?.id ?? null, origin: writingOrigin, revision: writingRevision },
          value,
          generation,
        );
      },
      onState: setAutosave,
      generation,
      shouldRetry: (error) => !(error instanceof NoteDraftConflict),
    });
    return {
      saver,
      revision: () => writingRevision,
      adopt(next: NoteDraftOrigin, revision: number) {
        writingOrigin = next;
        writingRevision = revision;
      },
    };
  });
  const saver = persistence.saver;

  const scope = useAutosaveScope()!;
  useEffect(() => scope.group.register(saver), [scope, saver]);

  function update(patch: Partial<NoteDraftFields>) {
    if (
      completedRef.current ||
      committing.current ||
      reviewAttempt.current !== null ||
      !mounted.current ||
      !contextValid.current ||
      !matchesNoteOrigin(originRef.current, latestNote.current) ||
      generation !== datasetGeneration()
    )
      return;
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setFields(next);
    saver.change(next);
  }

  // Leaving the screen, and the app leaving the foreground, are both moments
  // where whatever is waiting should be written rather than scheduled.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void saver.flush();
    });
    return () => {
      sub.remove();
      void saver.flush();
    };
  }, [saver]);

  const { data: doctorRows } = useLive(doctorsQuery());

  const doctorItems: PickerItem[] = useMemo(
    () =>
      (doctorRows ?? []).map((d) => ({
        id: d.id,
        label: doctorDisplayName(d),
        sublabel: d.specialtyText,
        keywords: d.searchText,
      })),
    [doctorRows],
  );
  const doctorLabel = doctorItems.find((d) => d.id === fields.doctorId)?.label ?? null;

  const useSoap = SOAP_NOTE_TYPES.includes(fields.type);
  const { data: previousRows } = useLive(latestPatientNoteQuery(patientId), [patientId]);
  const previous = previousRows?.[0] ?? null;
  const isConsult = CONSULT_NOTE_TYPES.includes(fields.type);

  async function persistCurrentDraftFields() {
    // The recorder's original dataset admission encloses both calls. Never
    // recursively flush the group here: it contains this recorder's handoff.
    if (completedRef.current) throw new Error('این پیش‌نویس بسته شده است؛ وویس جدید ثبت نشد.');
    requireContext();
    if (!matchesNoteOrigin(originRef.current, latestNote.current)) throw new NoteDraftConflict();
    saver.change(latest.current);
    if (!(await saver.flush())) throw new Error('متن پیش‌نویس هنوز ذخیره نشده است.');
  }

  function hasContent() {
    return draftHasContent(latest.current) || draftHasSavedVoice(draftId);
  }

  async function save() {
    if (committing.current || completedRef.current) return;
    committing.current = true;
    setSaving(true);
    try {
      await withDatasetWrite(generation, async () => {
        requireContext();
        if (!matchesNoteOrigin(originRef.current, latestNote.current)) throw new NoteDraftConflict();
        if (!(await scope.group.flush())) {
          notify('ذخیره نشد', 'متن یا وویس روی صفحه باقی مانده؛ دوباره تلاش کنید.');
          return;
        }
        if (!dateValidation.check()) return;
        if (!hasContent()) {
          notify('نوت خالی است', 'حداقل یک بخش را بنویسید یا وویس ضبط کنید.');
          return;
        }
        // Even an unchanged existing note may not have a draft yet.
        saver.change(latest.current);
        if (!(await saver.flush())) {
          notify('ذخیره نشد', 'نوشته روی صفحه باقی مانده؛ دوباره تلاش کنید.');
          return;
        }
        requireContext();
        await commitNoteDraft(
          draftId,
          generation,
          latestNote.current ?? undefined,
          new Date(now),
          persistence.revision(),
        );
        completedRef.current = true;
        saver.cancel();
        setCompleted(true);
        if (navigation.isFocused()) router.back();
      });
    } catch (e) {
      alertError('ذخیره نشد', e);
    } finally {
      committing.current = false;
      setSaving(false);
    }
  }

  async function reviewDraft() {
    if (committing.current || completedRef.current) return;
    committing.current = true;
    setSaving(true);
    try {
      await withDatasetWrite(generation, async () => {
        requireContext();
        // Read-only comparison also remains available after a refused raw CAS.
        // Local input stays mounted; adoption compares every shown persisted row.
        await scope.group.flush();
        const shown = await inspectNoteDraft(draftId, patientId, note?.id ?? null, generation);
        requireContext();
        if (mounted.current && navigation.isFocused()) setComparison(shown);
      });
    } catch (e) {
      alertError('پیش‌نویس بررسی نشد', e);
    } finally {
      committing.current = false;
      setSaving(false);
    }
  }

  function adoptReviewedDraft() {
    if (!comparison || committing.current || reviewAttempt.current || completedRef.current || !mounted.current) return;
    const shown = comparison;
    const mine = latest.current;
    const attempt = Symbol('note draft review');
    reviewAttempt.current = attempt;
    const cancel = () => {
      if (reviewAttempt.current === attempt) reviewAttempt.current = null;
    };
    let used = false;
    Alert.alert(
      'تطبیق پیش‌نویس؟',
      'نسخهٔ فعلی و پیش‌نویس ذخیره‌شده را مرور کردید؟ نوشتهٔ روی فرم جای پیش‌نویس ذخیره‌شده را می‌گیرد؛ ثبت در پرونده همچنان نیاز به تأیید شما دارد.',
      [
        { text: 'انصراف', style: 'cancel', onPress: cancel },
        {
          text: 'تطبیق',
          onPress: () => {
            if (used || reviewAttempt.current !== attempt) return;
            used = true;
            if (
              !mounted.current ||
              !navigation.isFocused() ||
              !contextValid.current ||
              generation !== datasetGeneration()
            ) {
              cancel();
              return;
            }
            committing.current = true;
            setSaving(true);
            void adoptNoteDraftOrigin(shown, generation, mine)
              .then(async (updated) => {
                if (!mounted.current) return;
                const next = decodeNoteOrigin(updated.origin!);
                originRef.current = next;
                persistence.adopt(next, updated.revision);
                setOrigin(next);
                setComparison(null);
                // A failed Autosave still owns pending local text. Acknowledge it
                // against the adopted revision instead of resetting the scheduler.
                saver.change(latest.current);
                if (!(await saver.flush()))
                  throw new Error('پیش‌نویس هنوز کامل ذخیره نشده است؛ نوشته روی صفحه باقی مانده.');
              })
              .catch((e) => alertError('پیش‌نویس تطبیق داده نشد', e))
              .finally(() => {
                cancel();
                committing.current = false;
                if (mounted.current) setSaving(false);
              });
          },
        },
      ],
      { onDismiss: cancel },
    );
  }

  async function discardAndLeave() {
    if (committing.current || completedRef.current) return;
    committing.current = true;
    setSaving(true);
    try {
      await withDatasetWrite(generation, async () => {
        requireContext();
        // Wait for in-flight writes before retiring the draft; failed deletion stays visible.
        if (!(await scope.group.flush())) {
          notify('پیش‌نویس حذف نشد', 'متن یا وویس هنوز ذخیره نشده است؛ دوباره تلاش کنید.');
          return;
        }
        requireContext();
        await discardNoteDraft(draftId, generation, persistence.revision());
        completedRef.current = true;
        saver.cancel();
        setCompleted(true);
        if (navigation.isFocused()) router.back();
      });
    } catch (e) {
      alertError('پیش‌نویس حذف نشد', e);
    } finally {
      committing.current = false;
      setSaving(false);
    }
  }

  function leave() {
    if (committing.current) return;
    if (stale) {
      Alert.alert('بستن فرم قبلی', 'نوشتهٔ روی این صفحه دور ریخته می‌شود. اطلاعات بازگردانی‌شده تغییر نمی‌کند.', [
        { text: 'ادامهٔ مرور', style: 'cancel' },
        {
          text: 'بستن فرم',
          style: 'destructive',
          onPress: () => {
            if (!navigation.isFocused()) return;
            // Local abandonment only: never retire a restored same-ID draft.
            saver.cancel();
            scope.abandonStale();
            router.back();
          },
        },
      ]);
      return;
    }
    if (!hasContent() && !scope.group.unsaved) {
      void discardAndLeave();
      return;
    }
    Alert.alert('این تغییرها هنوز در پرونده ثبت نشده', 'می‌خواهید متنش نگه داشته شود؟', [
      { text: 'ادامه‌ی نوشتن', style: 'cancel' },
      {
        text: 'نگه دار',
        onPress: () => {
          // Only leave if the text actually reached storage. `flush` resolves
          // either way; treating that as success would close the screen on the
          // one copy of the note that exists.
          void scope
            .canLeave()
            .then((stored) => {
              if (stored) {
                if (navigation.isFocused()) router.back();
              } else {
                notify(
                  'هنوز ذخیره نشد',
                  'نوشته‌ی شما روی صفحه هست و دوباره تلاش می‌شود. اگر حافظه‌ی گوشی پر است، کمی جا باز کنید.',
                );
              }
            })
            .catch((e) => alertError('ذخیره نشد', e));
        },
      },
      {
        text: 'دور بریز',
        style: 'destructive',
        onPress: () => void discardAndLeave(),
      },
    ]);
  }

  const autosaveLine =
    autosave.status === 'failed'
      ? autosave.error instanceof DatasetChangedError
        ? 'فرم قبلی ذخیره نمی‌شود؛ نوشته روی صفحه باقی مانده است'
        : autosave.error instanceof NoteDraftConflict
          ? 'پیش‌نویس تغییر کرده؛ ابتدا نسخهٔ فعلی را بررسی کنید'
          : 'پیش‌نویس ذخیره نشد — دوباره تلاش می‌شود'
      : autosave.status === 'pending' || autosave.status === 'writing'
        ? 'در حال ذخیره‌ی پیش‌نویس…'
        : autosave.status === 'saved'
          ? 'پیش‌نویس خودکار ذخیره شد'
          : null;

  if (completed) {
    return (
      <Screen scroll>
        {/* Preserve the scroll host too: changing it remounts ScreenOptions during native close. */}
        <ScreenOptions options={{ title: isEdit ? 'ویرایش نوت' : 'نوت جدید', headerRight: () => null }} />
        <Column collapsable={false} gap="md" style={{ paddingTop: spacing.md }}>
          <Text>این پیش‌نویس بسته شد.</Text>
          <Button
            label="بستن"
            onPress={() => {
              if (!navigation.isFocused()) return;
              if (stale) scope.abandonStale();
              router.back();
            }}
          />
        </Column>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <ScreenOptions
        options={{
          title: isEdit ? 'ویرایش نوت' : 'نوت جدید',
          // Save is also up here: a long admission note ends far below the
          // fold, and saving should not mean scrolling to the bottom first.
          headerRight: () => (
            <Row gap="xs">
              {isEdit ? (
                <IconButton
                  icon="time-outline"
                  label="تاریخچه"
                  disabled={locked}
                  onPress={() =>
                    void scope.perform(() => {
                      requireContext();
                      if (!navigation.isFocused()) return;
                      router.push({
                        pathname: '/patient/[id]/note-history',
                        params: { id: patientId, noteId: note!.id },
                      });
                    })
                  }
                />
              ) : null}
              <Button
                label="ثبت"
                variant="secondary"
                size="sm"
                loading={saving}
                disabled={locked}
                onPress={() => void save()}
              />
            </Row>
          ),
        }}
      />
      {/* Keep a native parent throughout saving/close; pointerEvents alone changes Fabric flattening. */}
      <Column collapsable={false} gap="md" pointerEvents={saving ? 'none' : 'auto'} style={{ paddingTop: spacing.md }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {patientLabel}
        </Text>
        {readNotice}
        <ErrorNotice error={readError} what="نوت و پیش‌نویس" onRetry={retryRead} />
        {contextChanged || unavailable ? (
          <Text color="danger">نوت یا مسیر پرونده تغییر کرده؛ نوشتهٔ این فرم برای مرور و کپی باقی مانده است.</Text>
        ) : null}
        {recovered ? (
          <Text variant="caption" color="textMuted">
            پیش‌نویس قبلی بازیابی شد.
          </Text>
        ) : null}

        {needsReview ? (
          <Text color="danger">مبنای پیش‌نویس با نسخهٔ فعلی مشخص یا یکسان نیست؛ پیش از ثبت، آن را بررسی کنید.</Text>
        ) : null}
        {(needsReview || autosave.status === 'failed') && !stale && !contextChanged ? (
          <Button
            label="بررسی نسخهٔ فعلی"
            variant="ghost"
            disabled={contextLocked}
            onPress={() => void reviewDraft()}
          />
        ) : null}
        {comparison ? (
          <NoteDraftReview
            comparison={comparison}
            disabled={contextLocked}
            onAdopt={adoptReviewedDraft}
            doctorName={(id) => doctorItems.find((item) => item.id === id)?.label ?? 'پزشک ثبت‌شده در نوت'}
          />
        ) : null}
        <ChipSelect
          label="نوع نوت"
          disabled={locked}
          options={TYPE_OPTIONS}
          value={fields.type}
          onChange={(v) => v && update({ type: v })}
        />

        <Input
          label={fields.type === 'event' ? 'چه اتفاقی افتاد؟' : 'عنوان'}
          editable={!locked}
          value={fields.title ?? ''}
          onChangeText={(v) => update({ title: v })}
          placeholder={fields.type === 'event' ? 'مثلاً Intubated / انتقال به ICU' : 'اختیاری'}
        />

        {isConsult && (
          <>
            <SelectField
              label={fields.type === 'consult_request' ? 'کانسالت از' : 'پاسخ‌دهنده'}
              disabled={locked}
              icon="person-outline"
              value={doctorLabel}
              placeholder="انتخاب یا افزودن پزشک"
              onPress={() => setPickingDoctor(true)}
              onClear={() => update({ doctorId: null })}
            />
            <Input
              label="سرویس"
              editable={!locked}
              value={fields.specialty ?? ''}
              onChangeText={(v) => update({ specialty: v })}
              placeholder="مثلاً قلب / عفونی"
            />
          </>
        )}

        {useSoap ? (
          <>
            {!isEdit && previous && !fields.assessment && !fields.plan && (previous.assessment || previous.plan) ? (
              // Most of a progress note is yesterday's assessment and plan, revised.
              // Copied only on request, into empty fields, and fully editable.
              <Button
                label="ادامه از نوت قبلی (Assessment و Plan)"
                disabled={locked}
                icon="copy-outline"
                variant="ghost"
                size="sm"
                onPress={() => update({ assessment: previous.assessment, plan: previous.plan })}
              />
            ) : null}
            <Input
              label="Subjective"
              editable={!locked}
              value={fields.subjective ?? ''}
              onChangeText={(v) => update({ subjective: v })}
              multiline
            />
            <Input
              label="Objective"
              editable={!locked}
              value={fields.objective ?? ''}
              onChangeText={(v) => update({ objective: v })}
              multiline
            />
            <Input
              label="Assessment"
              editable={!locked}
              value={fields.assessment ?? ''}
              onChangeText={(v) => update({ assessment: v })}
              multiline
            />
            <Input
              label="Plan"
              editable={!locked}
              value={fields.plan ?? ''}
              onChangeText={(v) => update({ plan: v })}
              multiline
            />
            {fields.body ? (
              <Input
                label="متن آزاد"
                editable={!locked}
                value={fields.body}
                onChangeText={(v) => update({ body: v })}
                multiline
              />
            ) : null}
          </>
        ) : (
          <Input
            label={fields.type === 'event' ? 'جزئیات' : 'متن نوت'}
            editable={!locked}
            value={fields.body ?? ''}
            onChangeText={(v) => update({ body: v })}
            multiline
            autoFocus={!isEdit}
          />
        )}

        <QuickDateField
          onValidityChange={dateValidation.setValid}
          label="زمان"
          disabled={locked}
          value={fields.noteDate ?? new Date(now)}
          rawInput={fields.rawDate!}
          onRawInputChange={(patch: Partial<DateTimeInput>) =>
            update({ rawDate: { ...latest.current.rawDate!, ...patch } })
          }
          onChange={(v) => update({ noteDate: v })}
          direction="past"
          withTime
        />

        <SectionHeader title="وویس" />
        {note ? (
          <VoiceNotesSection
            entityType="note"
            entityId={note.id}
            patientId={patientId}
            generation={generation}
            beforePersist={async () => {
              requireContext();
              if (!matchesNoteOrigin(originRef.current, latestNote.current)) throw new NoteDraftConflict();
            }}
          />
        ) : (
          <Column gap="sm">
            {fields.voices.map((v, i) => (
              <VoiceNotePlayer
                key={v.relativePath}
                uri={mediaUri(v.relativePath)}
                relativePath={v.relativePath}
                durationMs={v.durationMs}
                onLongPress={() => update({ voices: fields.voices.filter((_, j) => j !== i) })}
              />
            ))}
            <VoiceNotesSection
              entityType="note_draft"
              entityId={draftId}
              patientId={patientId}
              generation={generation}
              beforePersist={persistCurrentDraftFields}
              afterPersist={persistCurrentDraftFields}
            />
          </Column>
        )}

        <Toggle
          label="سنجاق در خلاصه‌ی پرونده"
          disabled={locked}
          description="نوت‌های سنجاق‌شده و رویدادهای مهم در صفحه‌ی اول پرونده دیده می‌شوند"
          value={fields.isPinned}
          onChange={(v) => update({ isPinned: v })}
        />
        <Toggle
          label="پیش‌نویس"
          disabled={locked}
          description="برای وقتی که بعداً کاملش می‌کنید"
          value={fields.isDraft}
          onChange={(v) => update({ isDraft: v })}
        />

        <Row gap="sm" style={{ marginTop: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label="ثبت در پرونده"
              icon="checkmark"
              onPress={() => void save()}
              loading={saving}
              disabled={locked}
              full
            />
          </View>
          <Button label="انصراف" variant="ghost" onPress={leave} haptic={false} disabled={saving} />
        </Row>
        {autosaveLine ? (
          <Text variant="tiny" style={{ color: autosave.status === 'failed' ? colors.danger : colors.textFaint }}>
            {autosaveLine}
          </Text>
        ) : null}
      </Column>

      <PickerModal
        visible={pickingDoctor}
        title="پزشک"
        items={doctorItems}
        selectedId={fields.doctorId}
        onClose={() => setPickingDoctor(false)}
        onSelect={(item) => {
          update({ doctorId: item.id });
          setPickingDoctor(false);
        }}
        onCreate={(text) =>
          withDatasetWrite(generation, async () => {
            requireContext();
            return quickCreateDoctor(text);
          })
        }
        createLabel="افزودن پزشک"
      />
    </Screen>
  );
}
