import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorNotice } from '@/components/error-notice';
import { Column, EmptyState, Fab, Row, Text } from '@/components/ui';
import type { PatientStatus } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { activeLocationsQuery, locationLabel } from '@/features/encounters/status';
import { CURRENT_STATUSES } from '@/features/patients/logic';
import { PatientCard } from '@/features/patients/patient-card';
import { patientListQuery } from '@/features/patients/queries';
import { toPersianDigits } from '@/lib/persian';
import { MIN_TOUCH, useTheme } from '@/theme';

import { PATIENT_STATUS, PATIENT_STATUS_ORDER } from './labels';

type Tab = 'all' | PatientStatus;

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

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');

  const statuses = useMemo<PatientStatus[] | undefined>(() => {
    if (tab === 'all') return [...CURRENT_STATUSES];
    return [tab];
  }, [tab]);

  const { data: rows, error } = useLive(patientListQuery({ search, statuses }), [search, tab]);
  // One query for the whole list: which ward and bed each admitted patient is in.
  const { data: locationRows } = useLive(activeLocationsQuery());
  const locations = useMemo(() => new Map((locationRows ?? []).map((r) => [r.patientId, r])), [locationRows]);
  const patients = rows ?? [];

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: 'جاری' },
    ...PATIENT_STATUS_ORDER.map((s) => ({ key: s as Tab, label: PATIENT_STATUS[s].label })),
  ];

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.background }]}>
      <Column gap="sm" style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
        <Row justify="space-between">
          <Text variant="display">بیماران</Text>
          <Text variant="caption" color="textFaint">
            {toPersianDigits(patients.length)} نفر
          </Text>
        </Row>

        <ErrorNotice error={error} what="لیست بیماران" />

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
            placeholder="نام، کد ملی، شماره پرونده…"
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          gap: spacing.sm,
        }}
        style={styles.chipStrip}
      >
        {tabs.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(t.key)}
              style={[
                styles.chip,
                {
                  borderRadius: radii.full,
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderColor: active ? colors.primary : colors.border,
                  paddingHorizontal: spacing.lg,
                },
              ]}
            >
              <Text variant="captionStrong" style={{ color: active ? colors.primaryText : colors.textMuted }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.flex}>
        {rows === undefined ? null : patients.length === 0 ? (
          <EmptyState
            icon={search ? 'search-outline' : 'people-outline'}
            title={search ? 'بیماری پیدا نشد' : 'هنوز بیماری ثبت نشده'}
            description={
              search
                ? 'جستجو را کوتاه‌تر کنید یا فیلتر وضعیت را عوض کنید.'
                : 'اولین بیمارتان را با دکمه‌ی + اضافه کنید.'
            }
          />
        ) : (
          <FlashList
            data={patients}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => <PatientCard patient={item} location={locationLabel(locations.get(item.id))} />}
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.huge * 2,
            }}
            keyboardDismissMode="on-drag"
          />
        )}
      </View>

      <Fab label="افزودن بیمار" onPress={() => router.push('/patient/new')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchInput: { flex: 1, paddingVertical: 10 },
  chipStrip: { flexGrow: 0 },
  chip: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
