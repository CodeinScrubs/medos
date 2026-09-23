import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Badge, Card, Column, Row, SectionHeader, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { daysBetween, formatJalaliLong } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { OCCASION_KIND_LABELS } from './labels';
import { daysUntilLabel, doctorDisplayName, occasionNextDate } from './logic';
import { upcomingOccasionsQuery } from './occasions-queries';

/**
 * Birthdays and other greetings coming up, on the Today screen.
 *
 * Sorted in JavaScript because "when is this next" is a Jalali calculation
 * SQLite cannot do. Nothing is shown when nothing is near, so the screen
 * stays about today rather than becoming a calendar.
 */
export function UpcomingOccasions({ now, withinDays = 14 }: { now: Date; withinDays?: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { data } = useLive(upcomingOccasionsQuery());

  const rows = useMemo(() => {
    return (data ?? [])
      .map(({ occasion, doctor }) => {
        const at = occasionNextDate(occasion, now);
        return { occasion, doctor, at, days: at ? (daysBetween(at, now) ?? 0) : null };
      })
      .filter((r) => r.days != null && r.days >= 0 && r.days <= withinDays)
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
  }, [data, now, withinDays]);

  if (rows.length === 0) return null;

  return (
    <>
      <SectionHeader title="مناسبت‌های نزدیک" count={rows.length} />
      <Column gap="sm">
        {rows.map(({ occasion, doctor, at, days }) => (
          <Pressable
            key={occasion.id}
            onPress={() => router.push({ pathname: '/doctor/[id]', params: { id: doctor.id } })}
          >
            <Card>
              <Row gap="sm" justify="space-between">
                <Column gap="xxs" style={styles.grow}>
                  <Row gap="xs">
                    <Ionicons name="gift-outline" size={16} color={colors.primary} />
                    <Text variant="bodyStrong" numberOfLines={1} style={styles.grow}>
                      {doctorDisplayName(doctor)}
                    </Text>
                  </Row>
                  <Text variant="caption" color="textMuted">
                    {occasion.title} — {at ? formatJalaliLong(at) : ''}
                  </Text>
                </Column>
                <Column gap="xxs" style={styles.end}>
                  <Badge
                    label={days == null ? '' : daysUntilLabel(days)}
                    tone={days != null && days <= 1 ? 'warning' : 'neutral'}
                  />
                  <Text variant="tiny" color="textFaint">
                    {OCCASION_KIND_LABELS[occasion.kind]}
                  </Text>
                </Column>
              </Row>
            </Card>
          </Pressable>
        ))}
      </Column>
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  end: { alignItems: 'flex-end' },
});
