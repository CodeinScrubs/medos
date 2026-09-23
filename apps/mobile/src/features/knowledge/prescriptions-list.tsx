import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { Badge, Card, ChipSelect, Column, EmptyState, Fab, Row, Text } from '@/components/ui';
import type { PrescriptionTemplate } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { AGE_GROUP_LABELS } from './labels';
import { itemsOf, prescriptionLine } from './logic';
import { prescriptionsQuery } from './prescriptions-queries';
import { SearchBar } from './search-bar';

type AgeFilter = 'all' | PrescriptionTemplate['ageGroup'];

const AGE_FILTERS = [
  { value: 'all' as AgeFilter, label: 'همه' },
  ...(['adult', 'pediatric', 'geriatric'] as const).map((g) => ({
    value: g as AgeFilter,
    label: AGE_GROUP_LABELS[g],
  })),
];

/**
 * The user's own routine prescriptions, most used first.
 *
 * Ordering by use is the whole trick: the three templates written every
 * clinic rise to the top without anyone maintaining a favourites list.
 */
export function PrescriptionsList() {
  const router = useRouter();
  const { spacing } = useTheme();
  const [search, setSearch] = useState('');
  const [age, setAge] = useState<AgeFilter>('all');

  const { data, error } = useLive(prescriptionsQuery({ search, ageGroup: age === 'all' ? null : age }), [search, age]);
  const rows = data ?? [];

  return (
    <View style={styles.flex}>
      <Column gap="sm" style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <SearchBar value={search} onChange={setSearch} placeholder="عنوان، شکایت، نام دارو…" />
        <ChipSelect options={AGE_FILTERS} value={age} onChange={(v) => v && setAge(v)} />
        <ErrorNotice error={error} what="فهرست نسخه‌ها" />
      </Column>

      {rows.length === 0 && data !== undefined ? (
        <EmptyState
          icon="receipt-outline"
          title={search || age !== 'all' ? 'چیزی پیدا نشد' : 'هنوز نسخه‌ای ثبت نشده'}
          description="نسخه‌های روتین خودتان: دارو، توصیه، هشدار و پیگیری. اپ چیزی پیشنهاد نمی‌کند — همانی را نگه می‌دارد که خودتان نوشته‌اید."
        />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(r) => r.template.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.huge * 2 }}
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/knowledge/rx/[id]', params: { id: item.template.id } })}
              style={{ marginTop: spacing.sm }}
            >
              <PrescriptionCard template={item.template} specialty={item.specialty?.nameFa ?? null} />
            </Pressable>
          )}
        />
      )}

      <Fab label="نسخه‌ی جدید" onPress={() => router.push('/knowledge/rx/edit')} />
    </View>
  );
}

function PrescriptionCard({ template, specialty }: { template: PrescriptionTemplate; specialty: string | null }) {
  const { colors } = useTheme();
  const items = itemsOf(template);
  const first = items[0];

  return (
    <Card>
      <Column gap="xxs">
        <Row gap="xs">
          <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
            {template.title}
          </Text>
          {template.starred && <Ionicons name="star" size={14} color={colors.warning} />}
        </Row>
        {template.condition ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {template.condition}
          </Text>
        ) : null}
        {first ? (
          <Text variant="caption" ltr numeric numberOfLines={1}>
            {prescriptionLine(first)}
            {items.length > 1 ? ` +${items.length - 1}` : ''}
          </Text>
        ) : null}
        <Row gap="xs" wrap>
          {template.ageGroup !== 'any' ? <Badge label={AGE_GROUP_LABELS[template.ageGroup]} tone="info" /> : null}
          {specialty ? <Badge label={specialty} /> : null}
          {template.usageCount > 0 ? (
            <Text variant="tiny" color="textFaint">
              {toPersianDigits(template.usageCount)} بار استفاده
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
