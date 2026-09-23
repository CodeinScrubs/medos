import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, View } from 'react-native';

import { EditGate } from '@/components/edit-gate';
import { alertError } from '@/components/feedback';
import { PickerModal, type PickerItem } from '@/components/picker-modal';
import { QuickDateField } from '@/components/quick-date-field';
import {
  Button,
  ChipSelect,
  Column,
  IconButton,
  Input,
  Row,
  Screen,
  SectionHeader,
  SelectField,
  Text,
  Toggle,
} from '@/components/ui';
import { useSaveBeforeLeave } from '@/components/use-save-before-leave';
import { VoiceNotePlayer } from '@/components/voice-note-player';
import { VoiceRecorder, type Recording } from '@/components/voice-recorder';
import { NOTE_TYPES, type Note, type NoteDraft, type NoteType } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { VoiceNotesSection } from '@/features/attachments/voice-notes';
import { doctorDisplayName } from '@/features/doctors/logic';
import { doctorsQuery, quickCreateDoctor } from '@/features/doctors/queries';
import { Autosave, type AutosaveState } from '@/lib/autosave';
import { newId } from '@/lib/ids';
import { extensionOf, mediaUri, storeFile } from '@/platform/media';
import { useTheme } from '@/theme';

import { commitNoteDraft } from './commit-queries';
import {
  discardNoteDraft,
  draftHasContent,
  noteDraftQuery,
  writeNoteDraft,
  type NoteDraftFields,
} from './draft-queries';
import { NOTE_TYPE_LABELS } from './labels';
import { CONSULT_NOTE_TYPES, SOAP_NOTE_TYPES } from './logic';
import { noteQuery } from './queries';

/**
 * SOAP fields for the note types actually written that way; a single body for
 * everything else. Forcing SOAP onto a one-line phone follow-up is friction.
 *
 * Nothing typed here waits for the save button. Every change goes to a draft
 * row a few seconds behind the keyboard (`lib/autosave.ts`), and a recording
 * is moved into storage the moment it stops. The note itself is still written
 * once, when the user says so: a chart entry is a decision, not a side effect
 * of typing. What the save button controls is what enters the record — not
 * whether the words survive.
 */

const TYPE_OPTIONS = NOTE_TYPES.map((t) => ({ value: t, label: NOTE_TYPE_LABELS[t] }));

/** Create or edit a note. Params: `id` (patient), optional `noteId`, optional `type`. */
export function NoteEditorScreen() {
  const { id: patientId, noteId, type } = useLocalSearchParams<{ id: string; noteId?: string; type?: string }>();
  const { data } = useLive(noteQuery(noteId ?? ''), [noteId]);
  // The type comes from the URL, so it is checked rather than trusted.
  const initialType = NOTE_TYPES.find((t) => t === type) ?? 'progress';
  return (
    <EditGate editing={Boolean(noteId)} rows={data}>
      {(note) => <DraftGate patientId={patientId} note={note} initialType={initialType} />}
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
function DraftGate({ patientId, note, initialType }: { patientId: string; note: Note | null; initialType: NoteType }) {
  const { colors, spacing } = useTheme();
  const { data } = useLive(noteDraftQuery(patientId, note?.id ?? null), [patientId, note?.id]);

  if (data === undefined) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.huge }} />
      </Screen>
    );
  }
  // The editor reads this once, when it mounts. Later versions of the row are
  // its own writes coming back, and must not be pushed into the fields.
  return <NoteEditor patientId={patientId} note={note} initialType={initialType} draft={data[0] ?? null} />;
}

function fieldsOf(note: Note | null, draft: NoteDraft | null, initialType: NoteType): NoteDraftFields {
  const source = draft ?? note;
  return {
    type: source?.type ?? initialType,
    title: source?.title ?? null,
    body: source?.body ?? null,
    subjective: source?.subjective ?? null,
    objective: source?.objective ?? null,
    assessment: source?.assessment ?? null,
    plan: source?.plan ?? null,
    noteDate: source?.noteDate ?? new Date(),
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
  initialType,
  draft,
}: {
  patientId: string;
  note: Note | null;
  initialType: NoteType;
  draft: NoteDraft | null;
}) {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const isEdit = note != null;
  // Both read the draft as it was on mount: the row changes underneath as this
  // screen writes to it, and neither answer should change with it.
  const [recovered] = useState(() => draft != null && draftHasContent(draft));
  const [draftId] = useState(() => draft?.id ?? newId());
  const [fields, setFields] = useState<NoteDraftFields>(() => fieldsOf(note, draft, initialType));
  // The scheduler reads this, not React state: it runs from timers, where a
  // stale closure would write an older version of the note over a newer one.
  const latest = useRef(fields);
  const [autosave, setAutosave] = useState<AutosaveState>({ status: 'idle' });

  const [pickingDoctor, setPickingDoctor] = useState(false);
  const [saving, setSaving] = useState(false);

  const saver = useMemo(
    () =>
      new Autosave<NoteDraftFields>({
        write: (value) => writeNoteDraft(draftId, { patientId, noteId: note?.id ?? null }, value),
        onState: setAutosave,
      }),
    [draftId, patientId, note?.id],
  );

  useSaveBeforeLeave(
    autosave.status === 'pending' || autosave.status === 'writing' || autosave.status === 'failed',
    () => saver.flush(),
  );

  function update(patch: Partial<NoteDraftFields>) {
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
  const isConsult = CONSULT_NOTE_TYPES.includes(fields.type);

  const committing = useRef(false);

  async function onRecorded(recording: Recording) {
    try {
      // Stored before it is listed: a file still in the recorder's cache is
      // not a voice note, whatever the screen shows.
      const stored = await storeFile(recording.uri, extensionOf(recording.uri, 'm4a'), { move: true });
      update({
        voices: [
          ...latest.current.voices,
          { relativePath: stored.relativePath, durationMs: recording.durationMs, sizeBytes: stored.sizeBytes },
        ],
      });
      if (!(await saver.flush())) Alert.alert('وویس هنوز ثبت نشد', 'وویس روی صفحه باقی مانده؛ دوباره ذخیره کنید.');
    } catch (e) {
      alertError('وویس ذخیره نشد', e);
    }
  }

  async function save() {
    if (committing.current) return;
    if (!draftHasContent(latest.current)) {
      Alert.alert('نوت خالی است', 'حداقل یک بخش را بنویسید یا وویس ضبط کنید.');
      return;
    }
    committing.current = true;
    setSaving(true);
    try {
      // Even an unchanged existing note may not have a draft yet.
      saver.change(latest.current);
      if (!(await saver.flush())) {
        Alert.alert('ذخیره نشد', 'نوشته روی صفحه باقی مانده؛ دوباره تلاش کنید.');
        return;
      }
      await commitNoteDraft(draftId);
      saver.cancel();
      router.back();
    } catch (e) {
      alertError('ذخیره نشد', e);
    } finally {
      committing.current = false;
      setSaving(false);
    }
  }

  async function discardAndLeave() {
    if (committing.current) return;
    committing.current = true;
    setSaving(true);
    try {
      // Wait for in-flight writes before retiring the draft; failed deletion stays visible.
      await saver.flush();
      await discardNoteDraft(draftId);
      saver.cancel();
      router.back();
    } catch (e) {
      alertError('پیش‌نویس حذف نشد', e);
    } finally {
      committing.current = false;
      setSaving(false);
    }
  }

  function leave() {
    if (committing.current) return;
    if (!draftHasContent(latest.current)) {
      void discardAndLeave();
      return;
    }
    Alert.alert(
      isEdit ? 'این تغییرها هنوز ذخیره نشده' : 'این نوت هنوز در پرونده ثبت نشده',
      'می‌خواهید متنش نگه داشته شود؟',
      [
        { text: 'ادامه‌ی نوشتن', style: 'cancel' },
        {
          text: 'نگه دار',
          onPress: () => {
            // Only leave if the text actually reached storage. `flush` resolves
            // either way; treating that as success would close the screen on the
            // one copy of the note that exists.
            void saver.flush().then((stored) => {
              if (stored) router.back();
              else {
                Alert.alert(
                  'هنوز ذخیره نشد',
                  'نوشته‌ی شما روی صفحه هست و دوباره تلاش می‌شود. اگر حافظه‌ی گوشی پر است، کمی جا باز کنید.',
                );
              }
            });
          },
        },
        {
          text: 'دور بریز',
          style: 'destructive',
          onPress: () => void discardAndLeave(),
        },
      ],
    );
  }

  const autosaveLine =
    autosave.status === 'failed'
      ? 'پیش‌نویس ذخیره نشد — دوباره تلاش می‌شود'
      : autosave.status === 'pending' || autosave.status === 'writing'
        ? 'در حال ذخیره‌ی پیش‌نویس…'
        : autosave.status === 'saved'
          ? 'پیش‌نویس خودکار ذخیره شد'
          : null;

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: isEdit ? 'ویرایش نوت' : 'نوت جدید',
          headerRight: isEdit
            ? () => (
                <IconButton
                  icon="time-outline"
                  label="تاریخچه"
                  onPress={() =>
                    router.push({
                      pathname: '/patient/[id]/note-history',
                      params: { id: patientId, noteId: note!.id },
                    })
                  }
                />
              )
            : undefined,
        }}
      />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {recovered ? (
          <Text variant="caption" color="textMuted">
            نوشته‌ی ذخیره‌نشده‌ی قبلی برگردانده شد.
          </Text>
        ) : null}

        <ChipSelect
          label="نوع نوت"
          options={TYPE_OPTIONS}
          value={fields.type}
          onChange={(v) => v && update({ type: v })}
        />

        <Input
          label={fields.type === 'event' ? 'چه اتفاقی افتاد؟' : 'عنوان'}
          value={fields.title ?? ''}
          onChangeText={(v) => update({ title: v })}
          placeholder={fields.type === 'event' ? 'مثلاً Intubated / انتقال به ICU' : 'اختیاری'}
        />

        {isConsult && (
          <>
            <SelectField
              label={fields.type === 'consult_request' ? 'کانسالت از' : 'پاسخ‌دهنده'}
              icon="person-outline"
              value={doctorLabel}
              placeholder="انتخاب یا افزودن پزشک"
              onPress={() => setPickingDoctor(true)}
              onClear={() => update({ doctorId: null })}
            />
            <Input
              label="سرویس"
              value={fields.specialty ?? ''}
              onChangeText={(v) => update({ specialty: v })}
              placeholder="مثلاً قلب / عفونی"
            />
          </>
        )}

        {useSoap ? (
          <>
            <Input
              label="Subjective"
              value={fields.subjective ?? ''}
              onChangeText={(v) => update({ subjective: v })}
              multiline
            />
            <Input
              label="Objective"
              value={fields.objective ?? ''}
              onChangeText={(v) => update({ objective: v })}
              multiline
            />
            <Input
              label="Assessment"
              value={fields.assessment ?? ''}
              onChangeText={(v) => update({ assessment: v })}
              multiline
            />
            <Input label="Plan" value={fields.plan ?? ''} onChangeText={(v) => update({ plan: v })} multiline />
            {fields.body ? (
              <Input label="متن آزاد" value={fields.body} onChangeText={(v) => update({ body: v })} multiline />
            ) : null}
          </>
        ) : (
          <Input
            label={fields.type === 'event' ? 'جزئیات' : 'متن نوت'}
            value={fields.body ?? ''}
            onChangeText={(v) => update({ body: v })}
            multiline
            autoFocus={!isEdit}
          />
        )}

        <QuickDateField
          label="زمان"
          value={fields.noteDate ?? new Date()}
          onChange={(v) => update({ noteDate: v })}
          direction="past"
          withTime
        />

        <SectionHeader title="وویس" />
        {note ? (
          <VoiceNotesSection entityType="note" entityId={note.id} patientId={patientId} />
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
            <VoiceRecorder
              label={fields.voices.length ? 'وویس دیگر' : 'ضبط وویس'}
              onRecorded={(rec) => void onRecorded(rec)}
            />
          </Column>
        )}

        <Toggle
          label="سنجاق در خلاصه‌ی پرونده"
          description="نوت‌های سنجاق‌شده و رویدادهای مهم در صفحه‌ی اول پرونده دیده می‌شوند"
          value={fields.isPinned}
          onChange={(v) => update({ isPinned: v })}
        />
        <Toggle
          label="پیش‌نویس"
          description="برای وقتی که بعداً کاملش می‌کنید"
          value={fields.isDraft}
          onChange={(v) => update({ isDraft: v })}
        />

        <Row gap="sm" style={{ marginTop: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button label="ذخیره" icon="checkmark" onPress={() => void save()} loading={saving} full />
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
        onCreate={quickCreateDoctor}
        createLabel="افزودن پزشک"
      />
    </Screen>
  );
}
