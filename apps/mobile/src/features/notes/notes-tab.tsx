import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';

import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Badge, Button, Card, ChipSelect, Column, EmptyState, Row, Text } from '@/components/ui';
import { useNow } from '@/components/use-now';
import { NOTE_TYPES } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { withDatasetWrite } from '@/lib/dataset-write';
import { formatJalaliDateTime, formatRelativeTime } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { NOTE_TYPE_LABELS } from './labels';
import { noteListCursor, NOTE_PAGE_SIZE, type NoteListCursor, type NoteListFilter } from './list-logic';
import { noteVoiceCountsQuery, patientNotePageQuery, patientNoteTypesQuery, type NoteListItem } from './list-queries';
import { deleteNote, setNotePinned } from './queries';

export function NotesTab(props: { patientId: string; onPageChange?: () => void }) {
  return <NotesBrowser key={props.patientId} {...props} />;
}

function NotesBrowser({ patientId, onPageChange }: { patientId: string; onPageChange?: () => void }) {
  const { spacing } = useTheme();
  const [filter, setFilter] = useState<NoteListFilter>('all');
  const [history, setHistory] = useState<NoteListCursor[]>([]);
  const cursor = history.at(-1);
  const { data: types, error: typesError, retry: retryTypes } = useLive(patientNoteTypesQuery(patientId), [patientId]);
  const presentTypes = NOTE_TYPES.filter((t) => types?.some((row) => row.type === t) || t === filter);
  const filters = [
    { value: 'all' as NoteListFilter, label: 'همه' },
    ...presentTypes.map((t) => ({ value: t as NoteListFilter, label: NOTE_TYPE_LABELS[t] })),
  ];

  return (
    <Column gap="sm" style={{ marginTop: spacing.lg }}>
      <ErrorNotice error={typesError} what="نوع نوت‌ها" onRetry={retryTypes} />
      <NotesPage
        key={`${filter}:${cursor?.pinned ?? ''}:${cursor?.at ?? ''}:${cursor?.id ?? ''}`}
        patientId={patientId}
        filter={filter}
        cursor={cursor}
        confirmedNoTypes={types !== undefined && !typesError && types.length === 0}
        filters={
          presentTypes.length > 1 || filter !== 'all' ? (
            <ChipSelect
              options={filters}
              value={filter}
              onChange={(value) => {
                if (!value || value === filter) return;
                setFilter(value);
                setHistory([]);
                onPageChange?.();
              }}
            />
          ) : null
        }
        onOlder={(next) => {
          setHistory([...history, next]);
          onPageChange?.();
        }}
        onNewer={
          history.length
            ? () => {
                setHistory(history.slice(0, -1));
                onPageChange?.();
              }
            : undefined
        }
      />
    </Column>
  );
}

function NotesPage({
  patientId,
  filter,
  cursor,
  confirmedNoTypes,
  filters,
  onOlder,
  onNewer,
}: {
  patientId: string;
  filter: NoteListFilter;
  cursor?: NoteListCursor;
  confirmedNoTypes: boolean;
  filters: ReactNode;
  onOlder: (cursor: NoteListCursor) => void;
  onNewer?: () => void;
}) {
  const router = useRouter();
  const { stale } = useDatasetIntent();
  // A page/filter change remounts this read only, never the patient's scroll/header
  // or original AutosaveScope. Old cached rows must not claim a different scope.
  const { data, error, retry, loading } = useLive(patientNotePageQuery(patientId, filter, cursor), [
    patientId,
    filter,
    cursor,
  ]);
  const shown = (data ?? []).slice(0, NOTE_PAGE_SIZE);
  const hasMore = data !== undefined && data.length > NOTE_PAGE_SIZE;
  const knownEmpty = data !== undefined && !error && shown.length === 0;
  return (
    <Column gap="sm">
      <ErrorNotice error={error} what="نوت‌ها" onRetry={retry} />
      {loading ? (
        <Text variant="caption" color="textMuted">
          در حال خواندن…
        </Text>
      ) : null}
      <Button
        label="نوت جدید"
        icon="add"
        variant="secondary"
        full
        disabled={stale}
        onPress={() =>
          router.push({
            pathname: '/patient/[id]/note',
            // A patient's first note is almost always the history; after that, a progress note.
            params: {
              id: patientId,
              ...(knownEmpty && confirmedNoTypes && filter === 'all' && !cursor ? { type: 'admission' } : {}),
            },
          })
        }
      />

      {filters}
      {shown.length === 0 ? (
        knownEmpty ? (
          <EmptyState
            icon="document-text-outline"
            title={filter === 'all' && !cursor ? 'هنوز نوتی ثبت نشده' : 'نوتی در این صفحه نیست'}
          />
        ) : null
      ) : (
        <NoteRows key={JSON.stringify(shown.map((n) => n.id))} patientId={patientId} items={shown} />
      )}
      <Row wrap>
        {onNewer ? <Button label="جدیدتر" variant="secondary" onPress={onNewer} /> : null}
        {hasMore && shown.length > 0 ? (
          <Button
            label="قدیمی‌تر"
            variant="secondary"
            disabled={Boolean(error) || loading}
            onPress={() => onOlder(noteListCursor(shown.at(-1)!))}
          />
        ) : null}
      </Row>
    </Column>
  );
}

function NoteRows({ patientId, items }: { patientId: string; items: NoteListItem[] }) {
  const now = new Date(useNow());
  const ids = items.map((n) => n.id);
  const { data, error, retry } = useLive(noteVoiceCountsQuery(patientId, ids), [patientId, JSON.stringify(ids)]);
  const voiceCount = new Map((error ? [] : (data ?? [])).map((row) => [row.noteId, row.count]));
  return (
    <Column gap="sm">
      <ErrorNotice error={error} what="وویس‌های نوت" onRetry={retry} />
      {items.map((note) => (
        <NoteCard key={note.id} note={note} patientId={patientId} voices={voiceCount.get(note.id) ?? 0} now={now} />
      ))}
    </Column>
  );
}

function NoteCard({
  note,
  patientId,
  voices,
  now,
}: {
  note: NoteListItem;
  patientId: string;
  voices: number;
  now: Date;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const { generation, stale } = useDatasetIntent();
  const isEvent = note.type === 'event';

  function actions() {
    Alert.alert(
      NOTE_TYPE_LABELS[note.type],
      formatJalaliDateTime(note.noteDate),
      [
        {
          text: note.isPinned ? 'برداشتن سنجاق' : 'سنجاق کردن',
          onPress: () =>
            void withDatasetWrite(generation, () => setNotePinned(note.id, !note.isPinned)).catch((e) =>
              alertError('تغییر ثبت نشد', e),
            ),
        },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () =>
            Alert.alert('حذف نوت؟', 'از پرونده‌ی بیمار برداشته می‌شود و از «بیشتر ← حذف‌شده‌ها» برمی‌گردد.', [
              { text: 'انصراف', style: 'cancel' },
              {
                text: 'حذف',
                style: 'destructive',
                onPress: () =>
                  void withDatasetWrite(generation, () => deleteNote(note.id)).catch((e) => alertError('حذف نشد', e)),
              },
            ]),
        },
        { text: 'انصراف', style: 'cancel' },
      ],
      { cancelable: true },
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${note.title || NOTE_TYPE_LABELS[note.type]}، ${formatJalaliDateTime(note.noteDate)}`}
      disabled={stale}
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
              {formatRelativeTime(note.noteDate, now)}
            </Text>
          </Row>
          {note.title ? (
            <Text variant="subheading" numberOfLines={2}>
              {note.title}
            </Text>
          ) : null}
          {note.preview ? (
            <Text variant="body" color="textMuted" numberOfLines={4}>
              {note.preview}
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
