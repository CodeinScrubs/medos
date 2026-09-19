import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Badge, Card, ChipSelect, Column, EmptyState, Fab, Row, Text } from '@/components/ui';
import type { Place } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { openInMaps } from '@/features/places/actions';
import { PLACE_KIND_LABELS } from '@/features/places/labels';
import { deletePlace, placesQuery } from '@/features/places/queries';
import { formatPhone, normalizePhone } from '@/lib/persian';
import { useTheme } from '@/theme';

type KindFilter = 'all' | Place['kind'];

export function PlacesScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const [kind, setKind] = useState<KindFilter>('all');
  const { data } = useLive(placesQuery({ kind: kind === 'all' ? undefined : kind }), [kind]);
  const rows = data ?? [];

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <ChipSelect
          value={kind}
          onChange={(v) => setKind(v ?? 'all')}
          options={[
            { value: 'all' as KindFilter, label: 'همه' },
            ...(Object.keys(PLACE_KIND_LABELS) as Place['kind'][]).map((k) => ({
              value: k as KindFilter,
              label: PLACE_KIND_LABELS[k],
            })),
          ]}
        />
      </View>

      {rows.length === 0 && data !== undefined ? (
        <EmptyState
          icon="location-outline"
          title="مکانی ثبت نشده"
          description="بیمارستان‌ها، مطب‌ها و آزمایشگاه‌ها — با آدرس، تلفن و لینک نقشه."
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge * 2, gap: spacing.sm }}
          renderItem={({ item }) => <PlaceCard place={item} />}
        />
      )}

      <Fab label="افزودن مکان" onPress={() => router.push('/places/edit')} />
    </View>
  );
}

function PlaceCard({ place }: { place: Place }) {
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();
  const phone = place.phone || place.switchboard;
  const hasLocation = Boolean(place.mapUrl || (place.lat && place.lng) || place.address);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/places/edit', params: { placeId: place.id } })}
      onLongPress={() =>
        Alert.alert('حذف مکان؟', place.name, [
          { text: 'انصراف', style: 'cancel' },
          { text: 'حذف', style: 'destructive', onPress: () => void deletePlace(place.id) },
        ])
      }
    >
      <Card>
        <Column gap="xs">
          <Row justify="space-between" gap="sm">
            <Text variant="subheading" style={styles.flex}>
              {place.name}
            </Text>
            <Badge label={PLACE_KIND_LABELS[place.kind]} tone="neutral" />
          </Row>
          {place.address ? (
            <Text variant="caption" color="textMuted" numberOfLines={2}>
              {place.city ? `${place.city}، ` : ''}
              {place.address}
            </Text>
          ) : null}
          <Row gap="sm" style={{ marginTop: spacing.xs }}>
            {phone ? (
              <Pressable
                onPress={() => void Linking.openURL(`tel:${normalizePhone(phone)}`)}
                style={[styles.action, { borderRadius: radii.sm, backgroundColor: colors.surfaceAlt }]}
              >
                <Ionicons name="call-outline" size={14} color={colors.primary} />
                <Text variant="tiny" color="primary" ltr>
                  {formatPhone(phone)}
                </Text>
              </Pressable>
            ) : null}
            {hasLocation ? (
              <Pressable
                onPress={() => void openInMaps(place)}
                style={[styles.action, { borderRadius: radii.sm, backgroundColor: colors.surfaceAlt }]}
              >
                <Ionicons name="navigate-outline" size={14} color={colors.primary} />
                <Text variant="tiny" color="primary">
                  مسیریابی
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => router.push({ pathname: '/extensions/edit', params: { placeId: place.id } })}
              style={[styles.action, { borderRadius: radii.sm, backgroundColor: colors.surfaceAlt }]}
            >
              <Ionicons name="add" size={14} color={colors.primary} />
              <Text variant="tiny" color="primary">
                داخلی
              </Text>
            </Pressable>
          </Row>
        </Column>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 32 },
});
