import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, StyleSheet } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { Badge, Button, Card, Column, EmptyState, IconButton, Row, Screen, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { VoiceNotesSection } from '@/features/attachments/voice-notes';
import { doctorDisplayName } from '@/features/doctors/logic';
import { formatJalaliLong } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { deleteTopic, markTopicReviewed, setTopicNeedsReview, setTopicStarred, topicQuery } from './queries';

/** Read one subject summary. Route param: `id`. */
export function TopicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { spacing } = useTheme();

  const { data, error } = useLive(topicQuery(id ?? ''), [id]);
  const row = data?.[0];
  const topic = row?.topic;

  if (!topic) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'مبحث' }} />
        <ErrorNotice error={error} what="مبحث" />
        {data && !error ? (
          <EmptyState
            icon="alert-circle-outline"
            title="پیدا نشد"
            description="ممکن است حذف شده باشد."
            action={<Button label="بازگشت" variant="ghost" onPress={() => router.back()} />}
          />
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: topic.title,
          headerRight: () => (
            <Row gap="xxs">
              <IconButton
                icon={topic.starred ? 'star' : 'star-outline'}
                label={topic.starred ? 'برداشتن ستاره' : 'ستاره‌دار کردن'}
                onPress={() => void setTopicStarred(topic.id, !topic.starred)}
              />
              <IconButton
                icon="create-outline"
                label="ویرایش"
                onPress={() => router.push({ pathname: '/knowledge/topic/edit', params: { topicId: topic.id } })}
              />
            </Row>
          ),
        }}
      />

      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <Row gap="xs" wrap>
          {row?.teacher ? <Badge label={doctorDisplayName(row.teacher)} icon="person-outline" /> : null}
          {row?.specialty ? <Badge label={row.specialty.nameFa} tone="info" /> : null}
          {topic.context ? <Badge label={topic.context} /> : null}
          {topic.taughtAt ? <Badge label={formatJalaliLong(topic.taughtAt)} tone="neutral" /> : null}
          {topic.needsReview ? <Badge label="نیاز به مرور" tone="warning" /> : null}
        </Row>

        <Section title="خلاصه" body={topic.summary} strong />
        <Section title="متن" body={topic.body} />
        <Section title="عین حرف استاد" body={topic.professorNotes} quote />
        <Section title="نکته‌های کلیدی" body={topic.pearls} />
        <Section title="منبع" body={topic.source} />

        {(topic.tags ?? []).length > 0 ? (
          <Row gap="xs" wrap>
            {(topic.tags ?? []).map((tag) => (
              <Badge key={tag} label={tag} />
            ))}
          </Row>
        ) : null}

        <VoiceNotesSection entityType="topic" entityId={topic.id} />

        {topic.needsReview ? (
          <Button
            label="مرور شد"
            icon="checkmark-done"
            variant="secondary"
            full
            onPress={() => void markTopicReviewed(topic.id)}
          />
        ) : (
          <Button
            label="علامت «نیاز به مرور»"
            icon="repeat"
            variant="secondary"
            full
            onPress={() => void setTopicNeedsReview(topic.id, true)}
          />
        )}
        {topic.lastReviewedAt ? (
          <Text variant="tiny" color="textFaint">
            آخرین مرور: {formatJalaliLong(topic.lastReviewedAt)}
          </Text>
        ) : null}

        <Button
          label="حذف مبحث"
          icon="trash-outline"
          variant="danger"
          full
          onPress={() =>
            Alert.alert('حذف این مبحث؟', topic.title, [
              { text: 'انصراف', style: 'cancel' },
              {
                text: 'حذف',
                style: 'destructive',
                onPress: () => {
                  void deleteTopic(topic.id).then(() => router.back());
                },
              },
            ])
          }
        />
      </Column>
    </Screen>
  );
}

function Section({
  title,
  body,
  strong = false,
  quote = false,
}: {
  title: string;
  body: string | null;
  strong?: boolean;
  quote?: boolean;
}) {
  const { colors, spacing } = useTheme();
  if (!body?.trim()) return null;
  return (
    <Card tone={quote ? 'alt' : 'surface'}>
      <Column gap="xxs">
        <Text variant="captionStrong" color="textMuted">
          {title}
        </Text>
        <Text
          variant={strong ? 'bodyStrong' : 'body'}
          style={quote ? [styles.quote, { borderColor: colors.primary, paddingStart: spacing.sm }] : undefined}
        >
          {body}
        </Text>
      </Column>
    </Card>
  );
}

const styles = StyleSheet.create({
  quote: { borderStartWidth: 3 },
});
