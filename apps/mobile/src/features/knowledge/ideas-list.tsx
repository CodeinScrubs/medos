import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Badge, Card, ChipSelect, Column, EmptyState, Fab, Row, Text } from '@/components/ui';
import type { Idea } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { formatRelative } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { deleteIdea, ideasQuery, setIdeaStatus } from './ideas-queries';
import { IDEA_KIND_LABELS, IDEA_PRIORITY_LABELS, IDEA_STATUS_LABELS, IDEA_STATUS_ORDER } from './labels';
import { SearchBar } from './search-bar';

type Filter = 'open' | 'all' | Idea['status'];

const FILTERS = [
  { value: 'open' as Filter, label: 'باز' },
  { value: 'all' as Filter, label: 'همه' },
  ...IDEA_STATUS_ORDER.map((s) => ({ value: s as Filter, label: IDEA_STATUS_LABELS[s] })),
];

/** Things to build into MedOS, written down before the shift swallows them. */
export function IdeasList() {
  const router = useRouter();
  const { spacing } = useTheme();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('open');

  const { data, error } = useLive(
    ideasQuery({
      search,
      openOnly: filter === 'open',
      status: filter === 'open' || filter === 'all' ? null : filter,
    }),
    [search, filter],
  );
  const rows = data ?? [];

  return (
    <View style={styles.flex}>
      <Column gap="sm" style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <SearchBar value={search} onChange={setSearch} placeholder="عنوان، توضیح، بخش…" />
        <ChipSelect options={FILTERS} value={filter} onChange={(v) => v && setFilter(v)} />
        <ErrorNotice error={error} what="دفترچه‌ی ایده‌ها" />
      </Column>

      {rows.length === 0 && data !== undefined ? (
        <EmptyState
          icon="bulb-outline"
          title={search || filter !== 'open' ? 'چیزی پیدا نشد' : 'دفترچه خالی است'}
          description="هر چیزی که سر شیفت به ذهنتان رسید و نباید فراموش شود: قابلیت، ایراد، یا فقط یک فکر."
        />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.huge * 2 }}
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => <IdeaCard idea={item} />}
        />
      )}

      <Fab tabRoot label="ایده‌ی جدید" onPress={() => router.push('/knowledge/idea')} />
    </View>
  );
}

function IdeaCard({ idea }: { idea: Idea }) {
  const router = useRouter();
  const { spacing } = useTheme();

  /** One tap moves it along the board; a long press offers to delete it. */
  function advance() {
    const next: Record<Idea['status'], Idea['status']> = {
      inbox: 'planned',
      planned: 'doing',
      doing: 'done',
      done: 'inbox',
      dropped: 'inbox',
    };
    void setIdeaStatus(idea.id, next[idea.status]).catch((e) => alertError('تغییر ثبت نشد', e));
  }

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/knowledge/idea', params: { ideaId: idea.id } })}
      onLongPress={() =>
        Alert.alert('حذف ایده؟', idea.title, [
          { text: 'انصراف', style: 'cancel' },
          {
            text: 'حذف',
            style: 'destructive',
            onPress: () => void deleteIdea(idea.id).catch((e) => alertError('حذف نشد', e)),
          },
        ])
      }
      style={{ marginTop: spacing.sm }}
    >
      <Card>
        <Column gap="xxs">
          <Row gap="sm" justify="space-between">
            <Text variant="bodyStrong" numberOfLines={2} style={styles.flex}>
              {idea.title}
            </Text>
            <Pressable onPress={advance} hitSlop={8} accessibilityLabel={`وضعیت: ${IDEA_STATUS_LABELS[idea.status]}`}>
              <Badge
                label={IDEA_STATUS_LABELS[idea.status]}
                tone={idea.status === 'doing' ? 'primary' : idea.status === 'done' ? 'success' : 'neutral'}
              />
            </Pressable>
          </Row>
          {idea.body ? (
            <Text variant="caption" color="textMuted" numberOfLines={2}>
              {idea.body}
            </Text>
          ) : null}
          <Row gap="xs" wrap>
            <Badge label={IDEA_KIND_LABELS[idea.kind]} />
            {idea.priority !== 'normal' ? (
              <Badge
                label={IDEA_PRIORITY_LABELS[idea.priority]}
                tone={idea.priority === 'high' ? 'warning' : 'neutral'}
              />
            ) : null}
            {idea.area ? <Badge label={idea.area} tone="info" /> : null}
            <Text variant="tiny" color="textFaint">
              {formatRelative(idea.createdAt)}
            </Text>
          </Row>
        </Column>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
