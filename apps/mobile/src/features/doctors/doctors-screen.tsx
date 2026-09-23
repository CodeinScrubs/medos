import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorNotice } from '@/components/error-notice';
import { PickerModal } from '@/components/picker-modal';
import { Avatar, Badge, Card, Column, EmptyState, Fab, IconButton, Row, Text } from '@/components/ui';
import type { Doctor, Specialty } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { toPersianDigits } from '@/lib/persian';
import { MIN_TOUCH, useTheme } from '@/theme';

import { callNumber } from './actions';
import { RELATIONSHIP_LABELS, RELATIONSHIP_ORDER } from './labels';
import { doctorDisplayName, latestRating, ratingAverage } from './logic';
import { doctorsQuery, setDoctorStarred, specialtiesQuery } from './queries';
import { allDoctorRatingsQuery } from './ratings-queries';

type RelationshipFilter = 'all' | 'starred' | Doctor['relationship'];

/**
 * The directory: everyone the physician works with, by name or by specialty.
 *
 * The specialty filter is a real filter rather than a text search because the
 * specialty tree is seeded — "paediatric infectious disease" is one tap, not a
 * guess at how the name was typed.
 */
export function DoctorsScreen() {
  const router = useRouter();
  const { colors, radii, spacing, typography } = useTheme();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RelationshipFilter>('all');
  const [specialtyId, setSpecialtyId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const { data: specialties } = useLive(specialtiesQuery());
  const { data, error } = useLive(
    doctorsQuery({
      search,
      specialtyId,
      relationship: filter === 'all' || filter === 'starred' ? null : filter,
      starredOnly: filter === 'starred',
    }),
    [search, filter, specialtyId],
  );
  const { data: ratings } = useLive(allDoctorRatingsQuery());

  const doctors = data ?? [];
  const specialtyName = useMemo(
    () => specialties?.find((s) => s.id === specialtyId)?.nameFa ?? null,
    [specialties, specialtyId],
  );

  /**
   * doctorId -> the average of their newest rating.
   *
   * Worked out here rather than in SQL: "the latest row per doctor" is an
   * awkward query, and a personal directory has a few hundred ratings at most.
   */
  const averages = useMemo(() => {
    const byDoctor = new Map<string, (typeof ratings & object)[number][]>();
    for (const r of ratings ?? []) byDoctor.set(r.doctorId, [...(byDoctor.get(r.doctorId) ?? []), r]);
    return new Map([...byDoctor].map(([id, rows]) => [id, ratingAverage(latestRating(rows) ?? undefined)] as const));
  }, [ratings]);

  const specialtyItems = useMemo(
    () =>
      (specialties ?? []).map((s: Specialty) => ({
        id: s.id,
        label: s.nameFa,
        sublabel: s.nameEn,
        keywords: (s.aliases ?? []).join(' '),
      })),
    [specialties],
  );

  const filters: { key: RelationshipFilter; label: string }[] = [
    { key: 'all', label: 'همه' },
    { key: 'starred', label: 'ستاره‌دار' },
    ...RELATIONSHIP_ORDER.map((r) => ({ key: r as RelationshipFilter, label: RELATIONSHIP_LABELS[r] })),
  ];

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.background }]}>
      <Column gap="sm" style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Row justify="space-between">
          <Text variant="display">پزشکان</Text>
          <Text variant="caption" color="textMuted">
            {toPersianDigits(doctors.length)} نفر
          </Text>
        </Row>

        <ErrorNotice error={error} what="فهرست پزشکان" />

        <Row
          gap="sm"
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing.md,
            minHeight: MIN_TOUCH,
          }}
        >
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="نام، تخصص، شماره…"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.primary}
            returnKeyType="search"
            style={[typography.body, styles.searchInput, { color: colors.text }]}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={12} accessibilityLabel="پاک کردن جستجو">
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          )}
        </Row>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={specialtyName ? `تخصص: ${specialtyName}` : 'انتخاب تخصص'}
          onPress={() => setPicking(true)}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Row gap="xs">
            <Ionicons name="medkit-outline" size={16} color={colors.primary} />
            <Text variant="caption" color={specialtyName ? 'primary' : 'textMuted'}>
              {specialtyName ?? 'همه‌ی تخصص‌ها'}
            </Text>
            {specialtyName ? (
              <Pressable onPress={() => setSpecialtyId(null)} hitSlop={12} accessibilityLabel="حذف فیلتر تخصص">
                <Ionicons name="close-circle" size={16} color={colors.textFaint} />
              </Pressable>
            ) : (
              <Ionicons name="chevron-down" size={14} color={colors.textFaint} />
            )}
          </Row>
        </Pressable>
      </Column>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm }}
        style={styles.chipStrip}
      >
        {filters.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(f.key)}
              style={{
                backgroundColor: active ? colors.primary : colors.surface,
                borderColor: active ? colors.primary : colors.border,
                borderWidth: 1,
                borderRadius: radii.full,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
              }}
            >
              <Text variant="caption" style={{ color: active ? colors.primaryText : colors.textMuted }}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.flex}>
        {doctors.length === 0 && data !== undefined ? (
          <EmptyState
            icon="people-outline"
            title={search || specialtyId || filter !== 'all' ? 'کسی با این فیلتر پیدا نشد' : 'هنوز پزشکی ثبت نشده'}
            description="اساتید، همکاران و پزشکان ارجاع — با شماره، تخصص، امتیاز شخصی و مناسبت‌هایشان."
          />
        ) : (
          <FlashList
            data={doctors}
            keyExtractor={(d) => d.id}
            renderItem={({ item }) => <DoctorCard doctor={item} average={averages.get(item.id) ?? null} />}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.huge * 2 }}
            keyboardDismissMode="on-drag"
          />
        )}
      </View>

      <Fab label="افزودن پزشک" onPress={() => router.push('/doctor/edit')} />

      <PickerModal
        visible={picking}
        title="تخصص"
        items={specialtyItems}
        selectedId={specialtyId}
        onClose={() => setPicking(false)}
        onSelect={(item) => {
          setSpecialtyId(item.id);
          setPicking(false);
        }}
        emptyText="تخصصی با این نام نیست"
      />
    </SafeAreaView>
  );
}

function DoctorCard({ doctor, average }: { doctor: Doctor; average: number | null }) {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const specialty = doctor.specialtyText;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/doctor/[id]', params: { id: doctor.id } })}
      style={{ marginTop: spacing.sm }}
    >
      <Card>
        <Row gap="sm">
          <Avatar first={doctor.firstName} last={doctor.lastName} />
          <Column gap="xxs" style={styles.flex}>
            <Row gap="xs">
              <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                {doctorDisplayName(doctor)}
              </Text>
              {doctor.starred && <Ionicons name="star" size={14} color={colors.warning} />}
            </Row>
            {specialty ? (
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {specialty}
              </Text>
            ) : null}
            <Row gap="xs">
              <Badge label={RELATIONSHIP_LABELS[doctor.relationship]} tone="neutral" />
              {average != null && (
                <Badge label={`${toPersianDigits(average)} از ۵`} tone="accent" icon="star-outline" />
              )}
            </Row>
          </Column>

          <Row gap="xxs">
            <IconButton
              icon={doctor.starred ? 'star' : 'star-outline'}
              label={doctor.starred ? 'برداشتن ستاره' : 'ستاره‌دار کردن'}
              onPress={() => void setDoctorStarred(doctor.id, !doctor.starred)}
            />
            {doctor.phone ? (
              <IconButton icon="call-outline" label="تماس" onPress={() => void callNumber(doctor.phone)} />
            ) : null}
          </Row>
        </Row>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chipStrip: { flexGrow: 0 },
  searchInput: { flex: 1, paddingVertical: 10 },
  pressed: { opacity: 0.7 },
});
