import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { ScreenOptions } from '@/components/screen-options';
import { Column, EmptyState, Screen, Text } from '@/components/ui';
import { useNow } from '@/components/use-now';
import { useLive } from '@/db/use-live';
import { toIsoDate } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';
import { endOfDay } from '@/lib/time';
import { useTheme } from '@/theme';

import { FollowUpCard } from './follow-up-card';
import { followUpListMode, upcomingFollowUps, type FollowUpListMode } from './list-logic';
import { dueFollowUpsQuery, pendingFollowUpsQuery } from './queries';

export function FollowUpListScreen() {
  const { mode: requested } = useLocalSearchParams<{ mode?: string }>();
  const timestamp = useNow();
  const now = new Date(timestamp);
  const mode = followUpListMode(requested);
  const day = toIsoDate(now);
  const [scope, setScope] = useState(() => ({ mode, day, now }));
  const [prompts, setPrompts] = useState<string[]>([]);
  const reportPrompt = useCallback((id: string, open: boolean) => {
    setPrompts((ids) => (ids.includes(id) === open ? ids : open ? [...ids, id] : ids.filter((value) => value !== id)));
  }, []);

  // A route change or midnight must not unmount an outcome being written.
  // Keep the old, accurately labelled list until its prompt is submitted/cancelled.
  if (prompts.length === 0 && (scope.mode !== mode || scope.day !== day)) {
    setScope({ mode, day, now: new Date(timestamp) });
  }

  return (
    <Screen padded={false}>
      <ScreenOptions options={{ title: scope.mode === 'due' ? 'پیگیری‌های امروز' : 'پیگیری‌های پیش رو' }} />
      <FollowUpResults
        key={`${scope.mode}:${scope.day}`}
        mode={scope.mode}
        now={scope.now}
        onPromptChange={reportPrompt}
      />
    </Screen>
  );
}

function FollowUpResults({
  mode,
  now,
  onPromptChange,
}: {
  mode: FollowUpListMode;
  now: Date;
  onPromptChange: (id: string, open: boolean) => void;
}) {
  const { colors, spacing } = useTheme();
  const { data, error, retry, loading } = useLive(
    mode === 'due' ? dueFollowUpsQuery(endOfDay(now)) : pendingFollowUpsQuery(),
  );
  const rows = mode === 'due' ? data : data === undefined ? undefined : upcomingFollowUps(data, now);
  return (
    <View style={styles.grow}>
      <Column gap="sm" style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
        <Text variant="caption" color="textMuted">
          {error || rows === undefined ? '—' : toPersianDigits(rows.length)} پیگیری
        </Text>
        <ErrorNotice error={error} what="پیگیری‌ها" onRetry={retry} />
      </Column>
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {rows === undefined || (error && rows.length === 0) ? null : rows.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title={mode === 'due' ? 'برای امروز پیگیری‌ای نمانده' : 'پیگیری پیش رویی نیست'}
        />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(row) => row.followUp.id}
          renderItem={({ item }) => (
            <FollowUpCard
              key={item.followUp.id}
              followUp={item.followUp}
              patient={item.patient}
              showPatient
              onPromptChange={onPromptChange}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ grow: { flex: 1 } });
