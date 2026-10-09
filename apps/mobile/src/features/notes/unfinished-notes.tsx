import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { Card, Column, Row, SectionHeader, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { formatJalaliDateTime } from '@/lib/jalali';
import { fullName } from '@/lib/persian';

import { openNoteDraftsQuery } from './draft-queries';
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
  const { data, error, retry } = useLive(openNoteDraftsQuery());
  const drafts = data ?? [];

  if (drafts.length === 0 && !error) return null;

  return (
    <>
      <SectionHeader title="نوت‌های ناتمام" count={error ? undefined : drafts.length} />
      <ErrorNotice error={error} what="نوت‌های ناتمام" onRetry={retry} />
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
