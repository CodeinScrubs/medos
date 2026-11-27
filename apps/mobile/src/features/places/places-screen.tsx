import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useNavigation } from 'expo-router/react-navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Badge, Card, ChipSelect, Column, EmptyState, Fab, Row, Text } from '@/components/ui';
import type { Place } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { callPlace, openInMaps, type PlaceDeviceOwner } from '@/features/places/actions';
import { PLACE_KIND_LABELS } from '@/features/places/labels';
import { deletePlace, placesQuery } from '@/features/places/queries';
import { UnfinishedWorkspaceForms } from '@/features/workspace-forms/unfinished-forms';
import { datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { formatPhone } from '@/lib/persian';
import { useTheme } from '@/theme';

type KindFilter = 'all' | Place['kind'];
type PlaceRow = Awaited<ReturnType<typeof placesQuery>>[number];
const EMPTY_ROWS: PlaceRow[] = [];

export function PlacesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { generation, stale } = useDatasetIntent();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<KindFilter>('all');
  const { data, error, retry } = useLive(placesQuery({ kind: kind === 'all' ? undefined : kind }), [kind]);
  const rows = data ?? EMPTY_ROWS;
  const [busy, setBusy] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const deviceActing = useRef(false);
  const readable = !stale && !error && data !== undefined;
  const latest = useRef({ ready: false, readable, rows });
  const ready = !busy && !deviceBusy && readable;
  useLayoutEffect(() => {
    latest.current = { ready, readable, rows };
  }, [ready, readable, rows]);
  const mounted = useRef(true);
  const attempt = useRef<symbol | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      attempt.current = null;
    };
  }, []);

  function deviceAction(row: PlaceRow, kind: 'phone' | 'map') {
    const owns = () =>
      mounted.current &&
      generation === datasetGeneration() &&
      navigation.isFocused() &&
      latest.current.readable &&
      latest.current.rows.some((p) => p.id === row.id && p.expectedBasis === row.expectedBasis);
    if (!owns() || deviceActing.current || attempt.current || busy) return;
    deviceActing.current = true;
    setDeviceBusy(true);
    const owner: PlaceDeviceOwner = { generation, expectedBasis: row.expectedBasis, owns };
    void (kind === 'phone' ? callPlace(row, owner) : openInMaps(row, owner))
      .catch((error: unknown) => {
        if (owns()) alertError(kind === 'phone' ? 'برنامهٔ تماس باز نشد' : 'نقشه باز نشد', error);
      })
      .finally(() => {
        deviceActing.current = false;
        if (mounted.current) {
          setDeviceBusy(false);
          retry();
        }
      });
  }

  function confirmDelete(row: PlaceRow) {
    const currentChoice = () =>
      latest.current.rows.some((p) => p.id === row.id && p.expectedBasis === row.expectedBasis);
    const ownsScreen = () => mounted.current && generation === datasetGeneration() && navigation.isFocused();
    if (!ownsScreen() || attempt.current || deviceActing.current || !latest.current.ready || !currentChoice()) return;
    const token = Symbol('place delete');
    attempt.current = token;
    let used = false;
    const release = () => {
      if (attempt.current === token) attempt.current = null;
    };
    Alert.alert(
      'حذف مکان؟',
      `${row.name}\nداخلی‌های این مکان پنهان می‌شوند. از سطل زباله می‌توانید مکان را برگردانید.`,
      [
        { text: 'انصراف', style: 'cancel', onPress: release },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => {
            if (used) return;
            used = true;
            if (
              !ownsScreen() ||
              attempt.current !== token ||
              deviceActing.current ||
              !latest.current.ready ||
              !currentChoice()
            ) {
              release();
              retry();
              return;
            }
            setBusy(true);
            void withDatasetWrite(generation, () => deletePlace(row.id, row.expectedBasis, new Date()))
              .catch((e: unknown) => {
                if (ownsScreen()) alertError('حذف نشد', e);
              })
              .finally(() => {
                release();
                if (mounted.current) {
                  setBusy(false);
                  retry();
                }
              });
          },
        },
      ],
      { cancelable: true, onDismiss: release },
    );
  }

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
        <ErrorNotice error={error} what="مکان‌ها" onRetry={retry} />
        <UnfinishedWorkspaceForms
          kind="place"
          onOpen={(placeId, draftId) =>
            router.push({ pathname: '/places/edit', params: { ...(placeId === null ? {} : { placeId }), draftId } })
          }
        />
      </View>

      {rows.length === 0 && data !== undefined && !error ? (
        <EmptyState
          icon="location-outline"
          title="مکانی ثبت نشده"
          description="بیمارستان‌ها، مطب‌ها و آزمایشگاه‌ها — با آدرس، تلفن و لینک نقشه."
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: spacing.huge * 2 + insets.bottom,
            gap: spacing.sm,
          }}
          renderItem={({ item }) => (
            <PlaceCard
              place={item}
              onDelete={() => confirmDelete(item)}
              onPhone={() => deviceAction(item, 'phone')}
              onMap={() => deviceAction(item, 'map')}
              locked={!ready}
            />
          )}
        />
      )}

      <Fab label="افزودن مکان" onPress={() => router.push('/places/edit')} />
    </View>
  );
}

function PlaceCard({
  place,
  onDelete,
  onPhone,
  onMap,
  locked,
}: {
  place: PlaceRow;
  onDelete: () => void;
  onPhone: () => void;
  onMap: () => void;
  locked: boolean;
}) {
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();
  const phone = place.phone || place.switchboard;
  const hasLocation = Boolean(place.mapUrl || (place.lat && place.lng) || place.address);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/places/edit', params: { placeId: place.id } })}
      onLongPress={() => {
        if (!locked) onDelete();
      }}
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
                accessibilityRole="button"
                accessibilityLabel="تماس با مکان"
                disabled={locked}
                onPress={onPhone}
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
                accessibilityRole="button"
                accessibilityLabel="نقشهٔ مکان"
                disabled={locked}
                onPress={onMap}
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
