import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { ScreenOptions } from '@/components/screen-options';
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
import { VitalsTab } from '@/features/vitals/vitals-tab';
import { useTheme } from '@/theme';

type Tab = 'overview' | 'timeline' | 'notes' | 'kardex' | 'vitals' | 'labs' | 'imaging' | 'media';

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'overview', label: 'خلاصه', icon: 'person-outline' },
  { key: 'timeline', label: 'روند', icon: 'time-outline' },
  { key: 'notes', label: 'نوت‌ها', icon: 'document-text-outline' },
  { key: 'kardex', label: 'کاردکس', icon: 'medical-outline' },
  { key: 'vitals', label: 'علائم', icon: 'pulse-outline' },
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
  return (
    <AutosaveScope key={id}>
      <PatientRecord id={id} initialTab={initialTab} />
    </AutosaveScope>
  );
}

function PatientRecord({ id, initialTab }: { id: string; initialTab?: Tab }) {
  const scope = useAutosaveScope()!;
  const router = useRouter();
  const { colors, spacing, radii } = useTheme();
  const [tab, setTab] = useState<Tab>(isTab(initialTab) ? initialTab : 'overview');
  useEffect(() => {
    if (!isTab(initialTab)) return;
    let current = true;
    // Route-parameter changes do not remove this screen, so the navigation exit
    // guard cannot protect its fields. Keep the old tab until they are durable.
    void scope.group
      .flush()
      .then((saved) => {
        if (!current) return;
        if (saved) setTab(initialTab);
        else Alert.alert('هنوز ذخیره نشد', 'نوشته روی صفحه باقی مانده است. دوباره تلاش کنید.');
      })
      .catch((error: unknown) => {
        if (current) alertError('تب باز نشد', error);
      });
    return () => {
      current = false;
    };
  }, [initialTab, scope]);

  const { data: rows, error } = useLive(patientQuery(id), [id]);

  if (error && !rows)
    return (
      <Screen>
        <ErrorNotice error={error} what="پرونده" />
      </Screen>
    );

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
            void scope.perform(() =>
              deletePatient(patient.id)
                .then(() => router.back())
                .catch((e) => alertError('حذف نشد', e)),
            );
          },
        },
      ],
    );
  };

  return (
    <>
      <ScreenOptions
        options={{
          title: `${patient.firstName} ${patient.lastName}`,
          headerRight: () => (
            <Row gap="xs">
              <IconButton
                icon="create-outline"
                label="ویرایش"
                onPress={() =>
                  void scope.perform(() => router.push({ pathname: '/patient/[id]/edit', params: { id } }))
                }
              />
              <IconButton icon="trash-outline" label="حذف" onPress={confirmDelete} />
            </Row>
          ),
        }}
      />

      <Screen scroll padded>
        <Column gap="md" style={{ paddingTop: spacing.md }}>
          <ErrorNotice error={error} what="پرونده" />
          <PatientHeader patient={patient} />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <Pressable
                  key={t.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() =>
                    void scope.perform(() => {
                      setTab(t.key);
                      router.setParams({ tab: t.key });
                    })
                  }
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
          {tab === 'vitals' && <VitalsTab patientId={id} />}
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
