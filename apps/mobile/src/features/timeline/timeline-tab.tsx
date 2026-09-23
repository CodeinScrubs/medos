import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Card, Column, EmptyState, Row, Text } from '@/components/ui';
import { formatJalaliDateTime } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { useTimeline, type TimelineKind } from './use-timeline';

const ICON: Record<TimelineKind, keyof typeof Ionicons.glyphMap> = {
  encounter: 'bed-outline',
  note: 'document-text-outline',
  lab: 'flask-outline',
  imaging: 'scan-outline',
  consult: 'chatbubbles-outline',
};

const KIND_LABEL: Record<TimelineKind, string> = {
  encounter: 'بستری',
  note: 'نوت',
  lab: 'آزمایش',
  imaging: 'تصویربرداری',
  consult: 'کانسالت',
};

/**
 * What happened to this patient, newest first.
 *
 * Nothing on this screen is stored: it is the record's own rows, sorted
 * together. Tapping an entry goes to the tab that owns it, because the entry
 * here is a pointer and the owner is where it can be edited.
 */
export function TimelineTab({ patientId }: { patientId: string }) {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { items, loading } = useTimeline(patientId);

  if (!loading && items.length === 0) {
    return (
      <EmptyState
        icon="time-outline"
        title="هنوز چیزی ثبت نشده"
        description="نوت، آزمایش، تصویربرداری، کانسالت و بستری‌ها به‌ترتیب زمان اینجا جمع می‌شوند."
      />
    );
  }

  return (
    <Column gap="sm" style={{ paddingTop: spacing.md }}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          onPress={() =>
            router.setParams
              ? router.setParams({ tab: item.tab ?? 'overview' })
              : router.push({ pathname: '/patient/[id]', params: { id: patientId, tab: item.tab ?? 'overview' } })
          }
        >
          <Card>
            <Row gap="sm" align="flex-start">
              <Ionicons name={ICON[item.kind]} size={18} color={colors.primary} style={styles.icon} />
              <Column gap="xxs" style={styles.grow}>
                <Row justify="space-between" gap="sm">
                  <Text variant="bodyStrong" numberOfLines={1} style={styles.grow}>
                    {item.title}
                  </Text>
                  <Text variant="tiny" color="textFaint">
                    {formatJalaliDateTime(item.at)}
                  </Text>
                </Row>
                {item.summary ? (
                  <Text variant="caption" color="textMuted" numberOfLines={2}>
                    {item.summary}
                  </Text>
                ) : null}
                <Text variant="tiny" color="textFaint">
                  {KIND_LABEL[item.kind]}
                </Text>
              </Column>
            </Row>
          </Card>
        </Pressable>
      ))}

      {items.length > 0 ? (
        <Text variant="tiny" color="textFaint">
          {toPersianDigits(items.length)} رویداد
        </Text>
      ) : null}
    </Column>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  icon: { marginTop: 2 },
});
