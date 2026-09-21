import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Column, EmptyState, IconButton, Row, Screen, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { MediaTab } from '@/features/attachments/media-tab';
import { ImagingTab } from '@/features/imaging/imaging-tab';
import { KardexTab } from '@/features/kardex/kardex-tab';
import { LabsTab } from '@/features/labs/labs-tab';
import { NotesTab } from '@/features/notes/notes-tab';
import { OverviewTab } from '@/features/patients/overview-tab';
import { PatientHeader } from '@/features/patients/patient-header';
import { deletePatient, patientQuery } from '@/features/patients/queries';
import { TimelineTab } from '@/features/timeline/timeline-tab';
import { useTheme } from '@/theme';

type Tab = 'overview' | 'timeline' | 'notes' | 'kardex' | 'labs' | 'imaging' | 'media';

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'overview', label: 'خلاصه', icon: 'person-outline' },
  { key: 'timeline', label: 'روند', icon: 'time-outline' },
  { key: 'notes', label: 'نوت‌ها', icon: 'document-text-outline' },
  { key: 'kardex', label: 'کاردکس', icon: 'medical-outline' },
  { key: 'labs', label: 'آزمایش', icon: 'flask-outline' },
  { key: 'imaging', label: 'تصویربرداری', icon: 'scan-outline' },
  { key: 'media', label: 'عکس و صدا', icon: 'images-outline' },
];

/** The tab comes from the URL — a notification or a deep link — so it is checked, not trusted. */
function isTab(value: unknown): value is Tab {
  return TABS.some((t) => t.key === value);
}

export function PatientRecordScreen() {
  const { id, tab: initialTab } = useLocalSearchParams<{ id: string; tab?: Tab }>();
  const router = useRouter();
  const { colors, spacing, radii } = useTheme();
  const [tab, setTab] = useState<Tab>(isTab(initialTab) ? initialTab : 'overview');

  const { data: rows } = useLive(patientQuery(id), [id]);

  if (!rows) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const patient = rows[0];
  if (!patient || patient.deletedAt) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title="پرونده پیدا نشد"
          description="ممکن است حذف شده باشد."
          action={<Button label="بازگشت" variant="ghost" onPress={() => router.back()} />}
        />
      </Screen>
    );
  }

  const confirmDelete = () => {
    Alert.alert(
      'حذف پرونده',
      `پرونده‌ی ${patient.firstName} ${patient.lastName} از لیست برداشته می‌شود. اطلاعات پاک نمی‌شود و از «بیشتر ← حذف‌شده‌ها» قابل برگرداندن است.`,
      [
        { text: 'انصراف', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => {
            void deletePatient(patient.id).then(() => router.back());
          },
        },
      ],
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: `${patient.firstName} ${patient.lastName}`,
          headerRight: () => (
            <Row gap="xs">
              <IconButton
                icon="create-outline"
                label="ویرایش"
                onPress={() => router.push({ pathname: '/patient/[id]/edit', params: { id } })}
              />
              <IconButton icon="trash-outline" label="حذف" onPress={confirmDelete} />
            </Row>
          ),
        }}
      />

      <Screen scroll padded>
        <Column gap="md" style={{ paddingTop: spacing.md }}>
          <PatientHeader patient={patient} />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <Pressable
                  key={t.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => setTab(t.key)}
                  style={[
                    styles.tab,
                    {
                      borderRadius: radii.full,
                      backgroundColor: active ? colors.primarySoft : 'transparent',
                      paddingHorizontal: spacing.md,
                    },
                  ]}
                >
                  <Ionicons name={t.icon} size={15} color={active ? colors.primary : colors.textFaint} />
                  <Text variant="captionStrong" color={active ? 'primary' : 'textMuted'}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {tab === 'overview' && <OverviewTab patient={patient} />}
          {tab === 'timeline' && <TimelineTab patientId={id} />}
          {tab === 'notes' && <NotesTab patientId={id} />}
          {tab === 'kardex' && <KardexTab patientId={id} />}
          {tab === 'labs' && <LabsTab patientId={id} />}
          {tab === 'imaging' && <ImagingTab patientId={id} />}
          {tab === 'media' && <MediaTab patientId={id} />}
        </Column>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tab: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
