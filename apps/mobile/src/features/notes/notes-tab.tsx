import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';

import { Badge, Button, Card, ChipSelect, Column, EmptyState, Row, Text } from '@/components/ui';
import type { Note, NoteType } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { patientMediaQuery } from '@/features/attachments/queries';
import { formatJalaliDateTime, formatRelativeTime } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { NOTE_TYPE_LABELS } from './labels';
import { notePreview } from './logic';
import { deleteNote, patientNotesQuery, setNotePinned } from './queries';

type Filter = 'all' | NoteType;

export function NotesTab({ patientId }: { patientId: string }) {
  const router = useRouter();
  const { spacing } = useTheme();
  const [filter, setFilter] = useState<Filter>('all');

  const { data } = useLive(patientNotesQuery(patientId), [patientId]);
  const { data: media } = useLive(patientMediaQuery(patientId, ['voice']), [patientId]);
  const notes = data ?? [];

  const voiceCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of media ?? []) if (a.entityType === 'note') m.set(a.entityId, (m.get(a.entityId) ?? 0) + 1);
    return m;
  }, [media]);

  // Only offer filters for note types this patient actually has.
  const presentTypes = [...new Set(notes.map((n) => n.type))];
  const filters = [
    { value: 'all' as Filter, label: 'همه' },
    ...presentTypes.map((t) => ({ value: t as Filter, label: NOTE_TYPE_LABELS[t] })),
  ];
  const shown = filter === 'all' ? notes : notes.filter((n) => n.type === filter);

  return (
    <Column gap="sm" style={{ marginTop: spacing.lg }}>
      <Button
        label="نوت جدید"
        icon="add"
        variant="secondary"
        full
        onPress={() => router.push({ pathname: '/patient/[id]/note', params: { id: patientId } })}
      />

      {notes.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="هنوز نوتی ثبت نشده"
          description="شرح حال، پراگرس، کانسالت، رویدادهای مهم و خلاصه‌ی ترخیص — با تایپ یا وویس."
        />
      ) : (
        <>
          {presentTypes.length > 1 && (
            <ChipSelect options={filters} value={filter} onChange={(v) => setFilter(v ?? 'all')} />
          )}
          {shown.map((n) => (
            <NoteCard key={n.id} note={n} patientId={patientId} voices={voiceCount.get(n.id) ?? 0} />
          ))}
        </>
      )}
    </Column>
  );
}

function NoteCard({ note, patientId, voices }: { note: Note; patientId: string; voices: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const isEvent = note.type === 'event';

  function actions() {
    Alert.alert(
      NOTE_TYPE_LABELS[note.type],
      formatJalaliDateTime(note.noteDate),
      [
        {
          text: note.isPinned ? 'برداشتن سنجاق' : 'سنجاق کردن',
          onPress: () => void setNotePinned(note.id, !note.isPinned),
        },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () =>
            Alert.alert('حذف نوت؟', 'نوت به حذف‌شده‌ها می‌رود و قابل برگرداندن است.', [
              { text: 'انصراف', style: 'cancel' },
              { text: 'حذف', style: 'destructive', onPress: () => void deleteNote(note.id) },
            ]),
        },
        { text: 'انصراف', style: 'cancel' },
      ],
      { cancelable: true },
    );
  }

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/patient/[id]/note', params: { id: patientId, noteId: note.id } })}
      onLongPress={actions}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Card style={isEvent ? { borderColor: colors.warning, borderWidth: 1 } : undefined}>
        <Column gap="xs">
          <Row justify="space-between" gap="sm">
            <Row gap="xs">
              {note.isPinned && <Ionicons name="pin" size={13} color={colors.primary} />}
              {isEvent && <Ionicons name="flash" size={13} color={colors.warning} />}
              <Text variant="captionStrong" color={isEvent ? 'warning' : 'primary'}>
                {NOTE_TYPE_LABELS[note.type]}
              </Text>
              {note.specialty ? <Badge label={note.specialty} tone="neutral" /> : null}
            </Row>
            <Text variant="tiny" color="textFaint">
              {formatRelativeTime(note.noteDate)}
            </Text>
          </Row>
          {note.title ? <Text variant="subheading">{note.title}</Text> : null}
          {notePreview(note) ? (
            <Text variant="body" color="textMuted" numberOfLines={4}>
              {notePreview(note)}
            </Text>
          ) : null}
          {voices > 0 ? (
            <Row gap="xxs">
              <Ionicons name="mic" size={13} color={colors.textFaint} />
              <Text variant="tiny" color="textFaint">
                {toPersianDigits(voices)} وویس
              </Text>
            </Row>
          ) : null}
        </Column>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
});
