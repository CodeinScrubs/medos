import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { Button, Card, Column, Row, SectionHeader, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { formatJalaliDateTime } from '@/lib/jalali';
import { fullName } from '@/lib/persian';

import { openNoteDraftsQuery, type OpenNoteDraftCursor } from './draft-queries';
import { notePreview } from './logic';

/**
 * Notes that were started and never put in the chart.
 *
 * Without this the drafts are safe but invisible: the editor only offers one
 * back when the same patient's note is opened again, and the thing typed at
 * 3 a.m. between two admissions is exactly the one nobody thinks to reopen.
 */
export function UnfinishedNotes() {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<OpenNoteDraftCursor[]>([]);
  const cursor = history.at(-1);
  return (
    <UnfinishedNotesPage
      key={`${expanded}:${cursor?.at ?? ''}:${cursor?.id ?? ''}`}
      cursor={cursor}
      expanded={expanded}
      onExpand={() => setExpanded(true)}
      onCollapse={() => {
        setHistory([]);
        setExpanded(false);
      }}
      onOlder={(next) => setHistory([...history, next])}
      onNewer={history.length ? () => setHistory(history.slice(0, -1)) : undefined}
    />
  );
}

function UnfinishedNotesPage({
  cursor,
  expanded,
  onExpand,
  onCollapse,
  onOlder,
  onNewer,
}: {
  cursor?: OpenNoteDraftCursor;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onOlder: (cursor: OpenNoteDraftCursor) => void;
  onNewer?: () => void;
}) {
  const router = useRouter();
  const pageSize = expanded ? 20 : 3;
  // Only this read remounts on page change; Today and its native header stay mounted.
  const { data, error, retry, loading } = useLive(openNoteDraftsQuery(pageSize + 1, cursor), [cursor, pageSize]);
  const drafts = (data ?? []).slice(0, pageSize);
  const hasMore = data !== undefined && data.length > pageSize;

  if (drafts.length === 0 && !error && !loading && !onNewer) return null;

  return (
    <>
      <SectionHeader title="نوت‌های ناتمام" />
      <ErrorNotice error={error} what="نوت‌های ناتمام" onRetry={retry} />
      {expanded || hasMore ? (
        <Row>
          <Button
            label={expanded ? 'نمایش کمتر' : 'همهٔ نوت‌های ناتمام'}
            variant="ghost"
            disabled={!expanded && (!!error || loading)}
            onPress={expanded ? onCollapse : onExpand}
            style={{ flex: 1 }}
          />
          {expanded && onNewer ? (
            <Button
              label="نوت‌های جدیدتر"
              variant="secondary"
              disabled={!!error || loading}
              onPress={onNewer}
              style={{ flex: 1 }}
            />
          ) : null}
          {expanded && hasMore ? (
            <Button
              label="نوت‌های قدیمی‌تر"
              variant="secondary"
              disabled={!!error || loading}
              style={{ flex: 1 }}
              onPress={() => {
                const last = drafts.at(-1);
                if (last) onOlder({ at: last.draft.updatedAt.getTime(), id: last.draft.id });
              }}
            />
          ) : null}
        </Row>
      ) : null}
      {loading ? (
        <Text variant="caption" color="textMuted">
          در حال خواندن…
        </Text>
      ) : null}
      {data !== undefined && !error && drafts.length === 0 && onNewer ? (
        <Text color="textMuted">در این صفحه نوت ناتمامی نیست.</Text>
      ) : null}
      <Column gap="sm">
        {drafts.map(({ draft, patient, voiceCount }) => (
          <Pressable
            key={draft.id}
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/patient/[id]/note',
                params: {
                  id: draft.patientId,
                  draftId: draft.id,
                  ...(draft.noteId ? { noteId: draft.noteId } : { type: draft.type }),
                },
              })
            }
          >
            <Card>
              <Column gap="xxs">
                <Row justify="space-between">
                  {/* Whose it is comes first: the point of the list is to be
                      able to pick the right one without opening them all. */}
                  <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                    {fullName(patient.firstName, patient.lastName)}
                  </Text>
                  <Text variant="tiny" color="textFaint">
                    {formatJalaliDateTime(draft.updatedAt)}
                  </Text>
                </Row>
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {notePreview(draft).trim() ||
                    draft.title?.trim() ||
                    (voiceCount > 0 || draft.voices?.length ? 'وویس ذخیره‌شده' : 'بدون متن')}
                </Text>
              </Column>
            </Card>
          </Pressable>
        ))}
      </Column>
    </>
  );
}
