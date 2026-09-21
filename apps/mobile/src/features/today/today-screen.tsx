import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { Card, Column, EmptyState, Fab, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { useNow } from '@/components/use-now';
import { useLive } from '@/db/use-live';
import { RestoreTrouble } from '@/features/backup/restore-trouble';
import { InboxSection } from '@/features/capture/inbox-section';
import { OpenConsults } from '@/features/consults/open-consults';
import { UpcomingOccasions } from '@/features/doctors/upcoming-occasions';
import { activeLocationsQuery, locationLabel } from '@/features/encounters/status';
import { FollowUpCard } from '@/features/followups/follow-up-card';
import { dueFollowUpsQuery, pendingFollowUpsQuery } from '@/features/followups/queries';
import { UnfinishedNotes } from '@/features/notes/unfinished-notes';
import { PatientCard } from '@/features/patients/patient-card';
import { patientListQuery } from '@/features/patients/queries';
import { ShiftCard } from '@/features/shifts/shift-card';
import { TasksSection } from '@/features/tasks/tasks-section';
import { daysBetween, formatJalaliWithWeekday, toIsoDate, toJalali } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';
import { endOfDay } from '@/lib/time';
import { useTheme } from '@/theme';

/**
 * What needs attention today: follow-ups that are due, then who is admitted.
 * Deliberately not a summary of everything.
 */
export function TodayScreen() {
  const { spacing } = useTheme();
  const router = useRouter();

  // "Today" moves on at midnight even if the screen was left open: the due
  // list is re-queried when the date changes, and counts use the same now.
  const now = new Date(useNow());
  const today = toIsoDate(now);

  const { data: due, error } = useLive(dueFollowUpsQuery(endOfDay(now)), [today]);
  const { data: pending } = useLive(pendingFollowUpsQuery());
  const { data: admitted } = useLive(patientListQuery({ statuses: ['admitted'] }));
  const { data: starred } = useLive(patientListQuery({ starredOnly: true }));
  const { data: locationRows } = useLive(activeLocationsQuery());
  const locations = useMemo(() => new Map((locationRows ?? []).map((r) => [r.patientId, r])), [locationRows]);

  const { jy } = toJalali(now);
  const dueRows = due ?? [];
  const overdue = dueRows.filter((r) => (daysBetween(r.followUp.dueAt, now) ?? 0) < 0).length;
  const upcoming = (pending ?? []).filter((r) => (daysBetween(r.followUp.dueAt, now) ?? 0) > 0).slice(0, 5);

  const loaded = due !== undefined && admitted !== undefined && pending !== undefined;
  const nothingYet = loaded && dueRows.length === 0 && (admitted?.length ?? 0) === 0 && (pending?.length ?? 0) === 0;

  return (
    <Screen scroll>
      <Column gap="none" style={{ paddingTop: spacing.md }}>
        <Text variant="caption" color="textMuted">
          {formatJalaliWithWeekday(now)} {toPersianDigits(jy)}
        </Text>
        <Text variant="display">امروز</Text>

        <ErrorNotice error={error} what="کارهای امروز" />
        <RestoreTrouble />

        <Row gap="sm" style={{ marginTop: spacing.lg }}>
          <StatTile icon="alarm-outline" label="پیگیری امروز" value={dueRows.length} alert={overdue > 0} />
          <StatTile
            icon="bed-outline"
            label="بستری"
            value={admitted?.length ?? 0}
            onPress={() => router.push('/patients')}
          />
          <StatTile
            icon="star-outline"
            label="ستاره‌دار"
            value={starred?.length ?? 0}
            onPress={() => router.push('/patients')}
          />
        </Row>

        {dueRows.length > 0 && (
          <>
            <SectionHeader
              title={overdue > 0 ? `پیگیری‌ها — ${toPersianDigits(overdue)} عقب‌افتاده` : 'پیگیری‌های امروز'}
              count={dueRows.length}
            />
            <Column gap="sm">
              {dueRows.map(({ followUp, patient }) => (
                <FollowUpCard key={followUp.id} followUp={followUp} patient={patient} showPatient />
              ))}
            </Column>
          </>
        )}

        {(admitted?.length ?? 0) > 0 && (
          <>
            <SectionHeader title="بیماران بستری" count={admitted!.length} />
            {admitted!.slice(0, 8).map((p) => (
              <PatientCard key={p.id} patient={p} location={locationLabel(locations.get(p.id))} />
            ))}
          </>
        )}

        <ShiftCard />

        <InboxSection />

        <TasksSection patientId={null} title="کارهای بدون بیمار" />

        <OpenConsults />

        <UnfinishedNotes />

        <UpcomingOccasions now={now} />

        {upcoming.length > 0 && (
          <>
            <SectionHeader title="پیگیری‌های پیش رو" count={upcoming.length} />
            <Column gap="sm">
              {upcoming.map(({ followUp, patient }) => (
                <FollowUpCard key={followUp.id} followUp={followUp} patient={patient} showPatient />
              ))}
            </Column>
          </>
        )}

        {nothingYet ? (
          <EmptyState
            icon="medkit-outline"
            title="امروز چیزی در انتظار شما نیست"
            description="بیماران بستری و پیگیری‌هایی که موعدشان رسیده اینجا جمع می‌شوند."
          />
        ) : null}

        {loaded && !nothingYet && dueRows.length === 0 ? (
          <Card tone="alt" style={{ marginTop: spacing.lg }}>
            <Text variant="caption" color="textFaint">
              برای امروز پیگیری‌ای نمانده.
            </Text>
          </Card>
        ) : null}
      </Column>

      <Fab icon="create-outline" label="ثبت سریع" onPress={() => router.push('/capture')} />
    </Screen>
  );
}

function StatTile({
  icon,
  label,
  value,
  onPress,
  alert = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  onPress?: () => void;
  alert?: boolean;
}) {
  const { colors, radii, spacing } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.grow, pressed && styles.pressed]}>
      <View
        style={{
          backgroundColor: alert ? colors.dangerSoft : colors.surface,
          borderRadius: radii.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: alert ? colors.danger : colors.border,
          padding: spacing.md,
          gap: spacing.xxs,
        }}
      >
        <Ionicons name={icon} size={18} color={alert ? colors.danger : colors.primary} />
        <Text variant="title" color={alert ? 'danger' : 'text'}>
          {toPersianDigits(value)}
        </Text>
        <Text variant="tiny" color="textMuted">
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  pressed: { opacity: 0.7 },
});
