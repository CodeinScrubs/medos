import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorNotice } from '@/components/error-notice';
import { ChipSelect, Column, EmptyState, Fab, Row, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { activeLocationsQuery, locationLabel } from '@/features/encounters/status';
import { PatientCard } from '@/features/patients/patient-card';
import { patientListQuery } from '@/features/patients/queries';
import { toPersianDigits } from '@/lib/persian';
import { MIN_TOUCH, useTheme } from '@/theme';

import { PATIENT_STATUS, PATIENT_STATUS_ORDER } from './labels';
import { parsePatientListRoute, patientListStatuses, type PatientListScope } from './list-route';

/**
 * The patient list.
 *
 * Default view is "current": admitted, outpatient and follow-up patients,
 * because the archive is rarely what is wanted mid-shift. Discharged and
 * archived patients are one chip away.
 */
export function PatientListScreen() {
  const { colors, spacing, radii, typography } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string; starred?: string; resetSearch?: string }>();
  const route = parsePatientListRoute(params);
  const [search, setSearch] = useState('');
  const resetRequested = params.resetSearch === '1';
  const [resetting, setResetting] = useState(false);
  if (resetting !== resetRequested) {
    setResetting(resetRequested);
    if (resetRequested) setSearch('');
  }
  const searching = search.trim().length > 0;

  // A Today tile asks for a fresh list. Returning from a record does not:
  // retain the search and keyboard state, consuming this request only once.
  useEffect(() => {
    if (params.resetSearch !== '1') return;
    router.setParams({ resetSearch: undefined });
  }, [params.resetSearch, router]);

  const tabs: { value: PatientListScope; label: string }[] = [
    { value: 'current', label: searching ? 'جستجو در همه' : 'جاری' },
    { value: 'all', label: 'همه وضعیت‌ها' },
    ...PATIENT_STATUS_ORDER.map((s) => ({ value: s, label: PATIENT_STATUS[s].label })),
  ];

  function setFilters(scope: PatientListScope, starredOnly: boolean) {
    router.setParams({ status: scope, starred: starredOnly ? '1' : '0' });
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.background }]}>
      <Column gap="sm" style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
        <Row justify="space-between">
          <Text variant="display">بیماران</Text>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="فقط بیماران ستاره‌دار"
            accessibilityState={{ checked: route.starredOnly }}
            onPress={() => setFilters(route.scope, !route.starredOnly)}
            style={styles.star}
          >
            <Ionicons
              name={route.starredOnly ? 'star' : 'star-outline'}
              size={24}
              color={route.starredOnly ? colors.primary : colors.textMuted}
            />
          </Pressable>
        </Row>

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
            placeholder="نام، پرونده، تشخیص یا تخت…"
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
      </Column>

      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
        <ChipSelect
          options={tabs}
          value={route.scope}
          onChange={(scope) => {
            if (scope) setFilters(scope, route.starredOnly);
          }}
        />
      </View>

      {/* Only the read region resets when the scope changes. useLive intentionally
          retains old rows on refresh; those must not masquerade as a new scope. */}
      <PatientResults
        key={`${route.scope}:${route.starredOnly}:${searching}`}
        search={search}
        scope={route.scope}
        starredOnly={route.starredOnly}
      />

      <Fab tabRoot label="افزودن بیمار" onPress={() => router.push('/patient/new')} />
    </SafeAreaView>
  );
}

function PatientResults({
  search,
  scope,
  starredOnly,
}: {
  search: string;
  scope: PatientListScope;
  starredOnly: boolean;
}) {
  const { colors, spacing } = useTheme();
  const searching = search.trim().length > 0;
  const statuses = useMemo(() => patientListStatuses(scope, searching), [scope, searching]);
  const {
    data: rows,
    error,
    retry,
    loading,
  } = useLive(patientListQuery({ search, statuses, starredOnly }), [search, statuses, starredOnly]);
  const { data: locationRows, error: locationError, retry: retryLocations } = useLive(activeLocationsQuery());
  const locations = useMemo(() => new Map((locationRows ?? []).map((r) => [r.patientId, r])), [locationRows]);
  const patients = rows ?? [];

  return (
    <View style={styles.flex}>
      <Column gap="sm" style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <Text variant="caption" color="textFaint">
          {error || rows === undefined ? '—' : toPersianDigits(patients.length)} نفر
          {starredOnly ? ' · ستاره‌دار' : ''}
        </Text>
        <ErrorNotice error={error} what="لیست بیماران" onRetry={retry} />
        <ErrorNotice error={locationError} what="محل بستری" onRetry={retryLocations} />
      </Column>
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {rows === undefined || (error && patients.length === 0) ? null : patients.length === 0 ? (
        <EmptyState
          icon={search ? 'search-outline' : 'people-outline'}
          // The default view hides discharged and archived patients, so an
          // empty list here does not mean nobody has been recorded.
          title={search ? 'بیماری پیدا نشد' : scope === 'current' ? 'بیمار جاری‌ای نیست' : 'در این دسته بیماری نیست'}
          description={
            search
              ? scope === 'current' || scope === 'all'
                ? 'جستجو را کوتاه‌تر کنید؛ نام، کد ملی، شماره پرونده، تشخیص یا تخت.'
                : 'جستجو را کوتاه‌تر کنید یا فیلتر وضعیت را بردارید.'
              : scope === 'current'
                ? 'بیمار تازه را با دکمه‌ی + اضافه کنید. ترخیص‌شده‌ها با جستجو یا چیپ‌های بالا پیدا می‌شوند.'
                : undefined
          }
        />
      ) : (
        <FlashList
          data={patients}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <PatientCard
              patient={item}
              location={
                locationError && item.status === 'admitted'
                  ? 'محل بستری خوانده نشد'
                  : locationLabel(locations.get(item.id))
              }
            />
          )}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.huge * 2,
          }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchInput: { flex: 1, paddingVertical: 10 },
  star: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
});
