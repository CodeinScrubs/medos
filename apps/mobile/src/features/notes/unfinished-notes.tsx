import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { Card, Column, Row, SectionHeader, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { formatJalaliDateTime } from '@/lib/jalali';

import { draftHasContent, openNoteDraftsQuery } from './draft-queries';
import { notePreview } from './logic';

/**
 * Notes that were started and never put in the chart.
 *
 * Without this the drafts are safe but invisible: the editor only offers one
 * back when the same patient's note is opened again, and the thing typed at
 * 3 a.m. between two admissions is exactly the one nobody thinks to reopen.
 */
export function UnfinishedNotes() {
  const router = useRouter();
  const { data } = useLive(openNoteDraftsQuery());
  const drafts = (data ?? []).filter(draftHasContent);

  if (drafts.length === 0) return null;

  return (
    <>
      <SectionHeader title="نوت‌های ناتمام" count={drafts.length} />
      <Column gap="sm">
        {drafts.map((draft) => (
          <Pressable
            key={draft.id}
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/patient/[id]/note',
                params: {
                  id: draft.patientId,
                  ...(draft.noteId ? { noteId: draft.noteId } : { type: draft.type }),
                },
              })
            }
          >
            <Card>
              <Row justify="space-between">
                <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                  {notePreview(draft) || 'بدون متن'}
                </Text>
                <Text variant="tiny" color="textFaint">
                  {formatJalaliDateTime(draft.updatedAt)}
                </Text>
              </Row>
            </Card>
          </Pressable>
        ))}
      </Column>
    </>
  );
}
