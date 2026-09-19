import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { EditGate } from '@/components/edit-gate';
import { alertError } from '@/components/feedback';
import { PickerModal, type PickerItem } from '@/components/picker-modal';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, ChipSelect, Column, Input, Row, Screen, SectionHeader, SelectField, Toggle } from '@/components/ui';
import { VoiceNotePlayer } from '@/components/voice-note-player';
import { VoiceRecorder, type Recording } from '@/components/voice-recorder';
import { NOTE_TYPES, type Note, type NoteType } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { saveRecording, VoiceNotesSection } from '@/features/attachments/voice-notes';
import { doctorDisplayName } from '@/features/doctors/logic';
import { doctorsQuery, quickCreateDoctor } from '@/features/doctors/queries';
import { useTheme } from '@/theme';

import { NOTE_TYPE_LABELS } from './labels';
import { CONSULT_NOTE_TYPES, SOAP_NOTE_TYPES } from './logic';
import { createNote, noteQuery, updateNote } from './queries';

/**
 * SOAP fields for the note types actually written that way; a single body for
 * everything else. Forcing SOAP onto a one-line phone follow-up is friction.
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
      {(note) => <NoteEditor patientId={patientId} note={note} initialType={initialType} />}
    </EditGate>
  );
}

function NoteEditor({ patientId, note, initialType }: { patientId: string; note: Note | null; initialType: NoteType }) {
  const router = useRouter();
  const { spacing } = useTheme();
  const isEdit = note != null;

  const [type, setType] = useState<NoteType>(note?.type ?? initialType);
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [subjective, setSubjective] = useState(note?.subjective ?? '');
  const [objective, setObjective] = useState(note?.objective ?? '');
  const [assessment, setAssessment] = useState(note?.assessment ?? '');
  const [plan, setPlan] = useState(note?.plan ?? '');
  const [noteDate, setNoteDate] = useState(() => note?.noteDate ?? new Date());
  const [specialty, setSpecialty] = useState(note?.specialty ?? '');
  const [doctorId, setDoctorId] = useState<string | null>(note?.doctorId ?? null);
  const [isPinned, setIsPinned] = useState(note?.isPinned ?? false);
  const [isDraft, setIsDraft] = useState(note?.isDraft ?? false);
  const [pendingVoices, setPendingVoices] = useState<Recording[]>([]);
  const [pickingDoctor, setPickingDoctor] = useState(false);
  const [saving, setSaving] = useState(false);

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
  const doctorLabel = doctorItems.find((d) => d.id === doctorId)?.label ?? null;

  const useSoap = SOAP_NOTE_TYPES.includes(type);
  const isConsult = CONSULT_NOTE_TYPES.includes(type);

  async function save() {
    const hasText = useSoap ? [subjective, objective, assessment, plan].some((v) => v.trim()) : body.trim().length > 0;
    if (!hasText && !title.trim() && pendingVoices.length === 0) {
      Alert.alert('نوت خالی است', 'حداقل یک بخش را بنویسید یا وویس ضبط کنید.');
      return;
    }

    setSaving(true);
    // When the type switches between SOAP and free text, keep whatever was
    // written in the other shape rather than silently dropping it.
    const payload = {
      type,
      title: title.trim() || null,
      body: body.trim() || null,
      subjective: subjective.trim() || null,
      objective: objective.trim() || null,
      assessment: assessment.trim() || null,
      plan: plan.trim() || null,
      noteDate,
      specialty: isConsult ? specialty.trim() || null : null,
      doctorId: isConsult ? doctorId : null,
      isPinned,
      isDraft,
    };

    try {
      let id: string;
      if (note) {
        id = note.id;
        await updateNote(id, payload);
      } else {
        id = await createNote({ patientId, ...payload });
      }

      for (const rec of pendingVoices) {
        await saveRecording(rec, { entityType: 'note', entityId: id, patientId });
      }
      router.back();
    } catch (e) {
      alertError('ذخیره نشد', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: isEdit ? 'ویرایش نوت' : 'نوت جدید' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <ChipSelect label="نوع نوت" options={TYPE_OPTIONS} value={type} onChange={(v) => v && setType(v)} />

        <Input
          label={type === 'event' ? 'چه اتفاقی افتاد؟' : 'عنوان'}
          value={title}
          onChangeText={setTitle}
          placeholder={type === 'event' ? 'مثلاً Intubated / انتقال به ICU' : 'اختیاری'}
        />

        {isConsult && (
          <>
            <SelectField
              label={type === 'consult_request' ? 'کانسالت از' : 'پاسخ‌دهنده'}
              icon="person-outline"
              value={doctorLabel}
              placeholder="انتخاب یا افزودن پزشک"
              onPress={() => setPickingDoctor(true)}
              onClear={() => setDoctorId(null)}
            />
            <Input label="سرویس" value={specialty} onChangeText={setSpecialty} placeholder="مثلاً قلب / عفونی" />
          </>
        )}

        {useSoap ? (
          <>
            <Input label="Subjective" value={subjective} onChangeText={setSubjective} multiline />
            <Input label="Objective" value={objective} onChangeText={setObjective} multiline />
            <Input label="Assessment" value={assessment} onChangeText={setAssessment} multiline />
            <Input label="Plan" value={plan} onChangeText={setPlan} multiline />
            {body ? <Input label="متن آزاد" value={body} onChangeText={setBody} multiline /> : null}
          </>
        ) : (
          <Input
            label={type === 'event' ? 'جزئیات' : 'متن نوت'}
            value={body}
            onChangeText={setBody}
            multiline
            autoFocus={!isEdit}
          />
        )}

        <QuickDateField label="زمان" value={noteDate} onChange={setNoteDate} direction="past" withTime />

        <SectionHeader title="وویس" />
        {note ? (
          <VoiceNotesSection entityType="note" entityId={note.id} patientId={patientId} />
        ) : (
          <Column gap="sm">
            {pendingVoices.map((v, i) => (
              <VoiceNotePlayer
                key={v.uri}
                uri={v.uri}
                durationMs={v.durationMs}
                onLongPress={() => setPendingVoices((list) => list.filter((_, j) => j !== i))}
              />
            ))}
            <VoiceRecorder
              label={pendingVoices.length ? 'وویس دیگر' : 'ضبط وویس'}
              onRecorded={(rec) => setPendingVoices((list) => [...list, rec])}
            />
          </Column>
        )}

        <Toggle
          label="سنجاق در خلاصه‌ی پرونده"
          description="نوت‌های سنجاق‌شده و رویدادهای مهم در صفحه‌ی اول پرونده دیده می‌شوند"
          value={isPinned}
          onChange={setIsPinned}
        />
        <Toggle label="پیش‌نویس" description="برای وقتی که بعداً کاملش می‌کنید" value={isDraft} onChange={setIsDraft} />

        <Row gap="sm" style={{ marginTop: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button label="ذخیره" icon="checkmark" onPress={() => void save()} loading={saving} full />
          </View>
          <Button label="انصراف" variant="ghost" onPress={() => router.back()} haptic={false} />
        </Row>
      </Column>

      <PickerModal
        visible={pickingDoctor}
        title="پزشک"
        items={doctorItems}
        selectedId={doctorId}
        onClose={() => setPickingDoctor(false)}
        onSelect={(item) => {
          setDoctorId(item.id);
          setPickingDoctor(false);
        }}
        onCreate={quickCreateDoctor}
        createLabel="افزودن پزشک"
      />
    </Screen>
  );
}
