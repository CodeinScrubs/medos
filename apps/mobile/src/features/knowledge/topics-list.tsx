import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { Badge, Card, ChipSelect, Column, EmptyState, Fab, Row, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { doctorDisplayName } from '@/features/doctors/logic';
import { formatJalali } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { topicsQuery } from './queries';
import { SearchBar } from './search-bar';

type Filter = 'all' | 'review' | 'starred';

const FILTERS = [
  { value: 'all' as Filter, label: 'همه' },
  { value: 'review' as Filter, label: 'نیاز به مرور' },
  { value: 'starred' as Filter, label: 'ستاره‌دار' },
];

/** Subject summaries, newest first, with the teacher's name on the card. */
export function TopicsList() {
  const router = useRouter();
  const { spacing } = useTheme();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const { data, error } = useLive(
    topicsQuery({ search, needsReviewOnly: filter === 'review', starredOnly: filter === 'starred' }),
    [search, filter],
  );
  const rows = data ?? [];

  return (
    <View style={styles.flex}>
      <Column gap="sm" style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <SearchBar value={search} onChange={setSearch} placeholder="عنوان، استاد، متن خلاصه…" />
        <ChipSelect options={FILTERS} value={filter} onChange={(v) => v && setFilter(v)} />
        <ErrorNotice error={error} what="فهرست مباحث" />
      </Column>

      {rows.length === 0 && data !== undefined ? (
        <EmptyState
          icon="book-outline"
          title={search || filter !== 'all' ? 'چیزی پیدا نشد' : 'هنوز مبحثی ثبت نشده'}
          description="خلاصه‌ی هر مبحث را با نام استادی که تدریسش کرده نگه دارید؛ ماه‌ها بعد همین لینک است که کار می‌کند."
        />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(r) => r.topic.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.huge * 2 }}
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/knowledge/topic/[id]', params: { id: item.topic.id } })}
              style={{ marginTop: spacing.sm }}
            >
              <TopicCard
                title={item.topic.title}
                summary={item.topic.summary}
                teacher={item.teacher ? doctorDisplayName(item.teacher) : null}
                specialty={item.specialty?.nameFa ?? null}
                context={item.topic.context}
                taughtAt={item.topic.taughtAt}
                starred={item.topic.starred}
                needsReview={item.topic.needsReview}
              />
            </Pressable>
          )}
        />
      )}

      <Fab label="مبحث جدید" onPress={() => router.push('/knowledge/topic/edit')} />
    </View>
  );
}

function TopicCard({
  title,
  summary,
  teacher,
  specialty,
  context,
  taughtAt,
  starred,
  needsReview,
}: {
  title: string;
  summary: string | null;
  teacher: string | null;
  specialty: string | null;
  context: string | null;
  taughtAt: Date | null;
  starred: boolean;
  needsReview: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Card>
      <Column gap="xxs">
        <Row gap="xs">
          <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
            {title}
          </Text>
          {starred && <Ionicons name="star" size={14} color={colors.warning} />}
        </Row>
        {summary ? (
          <Text variant="caption" color="textMuted" numberOfLines={2}>
            {summary}
          </Text>
        ) : null}
        <Row gap="xs" wrap>
          {teacher ? <Badge label={teacher} icon="person-outline" /> : null}
          {specialty ? <Badge label={specialty} tone="info" /> : null}
          {context ? <Badge label={context} /> : null}
          {needsReview ? <Badge label="نیاز به مرور" tone="warning" /> : null}
          {taughtAt ? (
            <Text variant="tiny" color="textFaint">
              {formatJalali(taughtAt)}
            </Text>
          ) : null}
        </Row>
      </Column>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
