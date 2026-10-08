import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRoute, useRouter } from 'expo-router';
import { StackActions, useNavigation } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { alertError, notify } from '@/components/feedback';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Column, EmptyState, IconButton, Row, Screen, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { MediaTab } from '@/features/attachments/media-tab';
import { ImagingTab } from '@/features/imaging/imaging-tab';
import { KardexTab } from '@/features/kardex/kardex-tab';
import { LabsTab } from '@/features/labs/labs-tab';
import { NotesTab } from '@/features/notes/notes-tab';
import { patientIdentity } from '@/features/patients/logic';
import { OverviewTab } from '@/features/patients/overview-tab';
import { PatientHeader } from '@/features/patients/patient-header';
import { deletePatient, patientQuery } from '@/features/patients/queries';
import { TimelineTab } from '@/features/timeline/timeline-tab';
import { VitalsTab } from '@/features/vitals/vitals-tab';
import { assertDatasetWrite, datasetGeneration } from '@/lib/dataset-write';
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
  const navigation = useNavigation();
  const route = useRoute();
  const { stale } = useDatasetIntent();
  const mounted = useRef(true);
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const renewalPending = useRef<symbol | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      renewalPending.current = null;
    };
  }, []);
  const { colors, spacing, radii } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const wideTabs = (width - spacing.lg * 2) / fontScale < 320;
  const [tab, setTab] = useState<Tab>(isTab(initialTab) ? initialTab : 'overview');
  useEffect(() => {
    if (!isTab(initialTab)) return;
    let current = true;
    // Route-parameter changes do not remove this screen, so the navigation exit
    // guard cannot protect its fields. Keep the old tab until they are durable.
    void scope
      .canLeave()
      .then((saved) => {
        if (!current) return;
        if (saved) setTab(initialTab);
        else notify('هنوز ذخیره نشد', 'نوشته روی صفحه باقی مانده است. دوباره تلاش کنید.');
      })
      .catch((error: unknown) => {
        if (current) alertError('تب باز نشد', error);
      });
    return () => {
      current = false;
    };
  }, [initialTab, scope]);

  const { data: rows, error, retry } = useLive(patientQuery(id), [id]);
  // A restore that omits this id must not unmount its raw, unregistered forms.
  // Keep the last non-stale snapshot until the owner explicitly opens a new route.
  const [retainedRows, setRetainedRows] = useState(rows);
  if (!stale && rows !== retainedRows) setRetainedRows(rows);
  const displayRows = stale ? retainedRows : rows;

  const renew = () => {
    if (!stale || renewalPending.current) return;
    const expected = datasetGeneration();
    const token = Symbol('renewal');
    const target = navigation.getState()?.key;
    if (!target) {
      notify('صفحه آماده نیست', 'پس از بارگذاری دوباره تلاش کنید.');
      return;
    }
    renewalPending.current = token;
    Alert.alert(
      'شروع با اطلاعات بازگردانی‌شده؟',
      'پیش از ادامه، نوشته‌های ثبت‌نشدهٔ این صفحه را مرور یا کپی کنید. فرم قبلی بسته می‌شود و چیزی از آن در اطلاعات بازگردانی‌شده ثبت نمی‌شود.',
      [
        {
          text: 'مرور نوشته‌ها',
          style: 'cancel',
          onPress: () => {
            if (renewalPending.current === token) renewalPending.current = null;
          },
        },
        {
          text: 'شروع تازه',
          onPress: () => {
            if (!mounted.current || renewalPending.current !== token) return;
            renewalPending.current = null;
            if (!navigation.isFocused() || navigation.getState()?.key !== target) return;
            try {
              assertDatasetWrite(expected);
              scope.abandonStale();
              // Replace only this originating route, through its always-on
              // removal guard. Global queued URL navigation has no source key.
              navigation.dispatch({
                ...StackActions.replace(route.name, { ...route.params, id, tab }),
                source: route.key,
                target,
              });
            } catch (e) {
              alertError('صفحه تازه نشد', e);
            }
          },
        },
      ],
    );
  };
  const staleNotice = stale ? (
    <Column gap="xs">
      <Text color="danger">اطلاعات از بکاپ جایگزین شد؛ نوشته‌های قبلی هنوز روی این صفحه‌اند.</Text>
      <Button label="شروع تازه" variant="secondary" onPress={renew} />
    </Column>
  ) : null;

  if (error && !displayRows)
    return (
      <Screen>
        {staleNotice}
        <ErrorNotice error={error} what="پرونده" onRetry={retry} />
      </Screen>
    );

  if (!displayRows) {
    if (stale) return <Screen>{staleNotice}</Screen>;
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const patient = displayRows[0];
  if (!patient || patient.deletedAt) {
    return (
      <Screen>
        {staleNotice}
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
      `پرونده‌ی ${patient.firstName} ${patient.lastName}${patientIdentity(patient) ? ` (${patientIdentity(patient)})` : ''} از لیست برداشته می‌شود. اطلاعات پاک نمی‌شود و از «بیشتر ← حذف‌شده‌ها» قابل برگرداندن است.`,
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

      <Screen scroll padded scrollRef={scrollRef}>
        <Column gap="md" style={{ paddingTop: spacing.md }}>
          {staleNotice}
          <ErrorNotice error={error} what="پرونده" onRetry={retry} />
          <PatientHeader patient={patient} />

          {/*
           * Every part of the record in view at once, four to a row, rather
           * than a sideways strip where the last tabs sat off-screen.
           */}
          <View
            style={[
              styles.tabs,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg },
            ]}
          >
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
                  style={({ pressed }) => [styles.tabCell, wideTabs && { width: '50%' }, pressed && styles.pressed]}
                >
                  <View
                    style={[
                      styles.tab,
                      { borderRadius: radii.md, backgroundColor: active ? colors.primarySoft : 'transparent' },
                    ]}
                  >
                    <Ionicons name={t.icon} size={18} color={active ? colors.primary : colors.textFaint} />
                    <Text variant="caption" color={active ? 'primary' : 'textMuted'} style={{ textAlign: 'center' }}>
                      {t.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {tab === 'overview' && <OverviewTab patient={patient} />}
          {tab === 'timeline' && (
            <TimelineTab patientId={id} onPageChange={() => scrollRef.current?.scrollTo({ y: 0, animated: false })} />
          )}
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
  tabs: { flexDirection: 'row', flexWrap: 'wrap', padding: 4, borderWidth: StyleSheet.hairlineWidth },
  tabCell: { width: '25%', padding: 2 },
  tab: { minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 4 },
  pressed: { opacity: 0.6 },
});
