import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AutosaveField } from '@/components/autosave-field';
import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { PickerModal, type PickerItem } from '@/components/picker-modal';
import { ScreenOptions } from '@/components/screen-options';
import { Badge, Button, Card, Column, EmptyState, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { locationLabel } from '@/features/encounters/status';
import { patientPickerSublabel } from '@/features/patients/logic';
import { patientListQuery } from '@/features/patients/queries';
import { formatJalaliDateTime } from '@/lib/jalali';
import { fullName, joinLabels, toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import {
  activeShiftQuery,
  addPatientToShift,
  endShift,
  removePatientFromShift,
  setShiftPatientReviewed,
  shiftPatientsQuery,
  shiftProgress,
  startShift,
  updateShiftPatient,
} from './queries';

/**
 * The shift: who is being carried right now, and who has been seen.
 *
 * This is the round, in the order the round happens. Marking someone seen is
 * one tap and reversible, because the common mistake is tapping the wrong row
 * while walking, not forgetting to tap at all. Nothing here is clinical: a
 * shift records where the attention went, and deleting one never touches a
 * patient's record.
 */
export function ShiftScreen() {
  return (
    <AutosaveScope>
      <ShiftScreenContent />
    </AutosaveScope>
  );
}

function ShiftScreenContent() {
  const scope = useAutosaveScope()!;
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { data: shifts, error, retry: retryShift } = useLive(activeShiftQuery());
  const shift = shifts?.[0] ?? null;

  const {
    data: members,
    error: membersError,
    retry: retryMembers,
  } = useLive(shiftPatientsQuery(shift?.id ?? ''), [shift?.id]);
  const rows = useMemo(() => (members ?? []).filter((row) => row.member.shiftId === shift?.id), [members, shift?.id]);
  const progress = error || membersError || members === undefined ? null : shiftProgress(rows);

  const [picking, setPicking] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const {
    data: patientRows,
    error: patientsError,
    loading: patientsLoading,
    retry: retryPatients,
  } = useLive(patientListQuery());

  const patientItems: PickerItem[] = useMemo(
    () =>
      (patientRows ?? []).map((p) => ({
        id: p.id,
        label: fullName(p.firstName, p.lastName),
        sublabel: patientPickerSublabel(p),
        keywords: p.searchText,
      })),
    [patientRows],
  );

  // On a ward, the shift is usually every admitted patient: one tap instead of
  // one picker per patient. Anyone else is still added by hand.
  const inShift = new Set(rows.map(({ patient }) => patient.id));
  const admittedNotInShift = patientsError
    ? []
    : (patientRows ?? []).filter((p) => p.status === 'admitted' && !inShift.has(p.id));

  function retryReads() {
    if (error) retryShift();
    if (membersError) retryMembers();
    if (patientsError) retryPatients();
  }

  async function addAllAdmitted() {
    if (!shift || !progress || patientsError || patientsLoading || writing.current) return;
    writing.current = true;
    setBusy(true);
    try {
      for (const p of admittedNotInShift) await addPatientToShift(shift.id, p.id);
    } catch (e) {
      alertError('اضافه نشد', e);
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  async function begin() {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    try {
      await startShift();
    } catch (e) {
      alertError('شیفت شروع نشد', e);
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  function finish() {
    if (!shift || error) return;
    Alert.alert('پایان شیفت؟', 'لیست بیماران این شیفت می‌ماند و بعداً هم می‌توانید ببینیدش.', [
      { text: 'انصراف', style: 'cancel' },
      { text: 'پایان شیفت', onPress: () => void scope.perform(() => endShift(shift.id)) },
    ]);
  }

  if (error && !shift) {
    return (
      <Screen scroll>
        <ScreenOptions options={{ title: 'شیفت' }} />
        <Column gap="md" style={{ paddingTop: spacing.md }}>
          <ErrorNotice error={error} what="شیفت" onRetry={retryReads} />
          <Button label="شیفت‌های قبلی" variant="ghost" onPress={() => router.push('/shift-history')} />
        </Column>
      </Screen>
    );
  }

  if (shifts !== undefined && !shift && !error) {
    return (
      <Screen scroll>
        <ScreenOptions options={{ title: 'شیفت' }} />
        <Column gap="md" style={{ paddingTop: spacing.md }}>
          <ErrorNotice error={error} what="شیفت" />
          <EmptyState
            icon="time-outline"
            title="شیفتی باز نیست"
            description="شیفت را شروع کنید تا بیماران این شیفت یک‌جا جمع شوند و بدانید کدام را دیده‌اید."
            action={<Button label="شروع شیفت" icon="play" onPress={() => void begin()} loading={busy} />}
          />
          <Button label="شیفت‌های قبلی" variant="ghost" onPress={() => router.push('/shift-history')} />
        </Column>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: 'شیفت' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <ErrorNotice error={error ?? membersError ?? patientsError} what="شیفت" onRetry={retryReads} />
        {!error && !membersError && (shifts === undefined || (shift && members === undefined)) ? (
          <Text variant="caption" color="textMuted">
            در حال خواندن…
          </Text>
        ) : null}

        {shift ? (
          <Card style={{ borderColor: colors.primary, borderWidth: 1 }}>
            <Column gap="sm">
              <Row justify="space-between" align="flex-start">
                <Column gap="xxs" style={styles.grow}>
                  <Text variant="subheading">{joinLabels([shift.ward, 'شیفت باز'])}</Text>
                  <Text variant="caption" color="textMuted">
                    از {formatJalaliDateTime(shift.startAt)}
                  </Text>
                </Column>
                <Badge
                  label={
                    progress
                      ? `${toPersianDigits(progress.seen)} از ${toPersianDigits(progress.total)} دیده‌شده`
                      : 'وضعیت بیماران نامشخص'
                  }
                  tone={progress && progress.total > 0 && progress.seen === progress.total ? 'success' : 'neutral'}
                />
              </Row>

              <Row gap="sm">
                <View style={styles.grow}>
                  <Button
                    label="شروع راند"
                    icon="walk-outline"
                    onPress={() => void scope.perform(() => router.push('/round'))}
                    disabled={rows.length === 0 || progress === null}
                    full
                  />
                </View>
                <Button
                  label="افزودن بیمار"
                  icon="person-add-outline"
                  variant="secondary"
                  disabled={busy || error != null}
                  onPress={() => setPicking(true)}
                />
              </Row>

              {progress && admittedNotInShift.length > 0 ? (
                <Button
                  label={`افزودن همه‌ی بستری‌ها (${toPersianDigits(admittedNotInShift.length)})`}
                  icon="people-outline"
                  variant="secondary"
                  loading={busy}
                  onPress={() => void addAllAdmitted()}
                />
              ) : null}
              <Button label="پایان شیفت" variant="ghost" onPress={finish} disabled={error != null} haptic={false} />
            </Column>
          </Card>
        ) : null}

        <SectionHeader title="بیماران این شیفت" count={progress?.total} />

        {progress?.total === 0 ? (
          <EmptyState
            icon="people-outline"
            title="هنوز بیماری اضافه نشده"
            description="بیمارانی که در این شیفت مسئولشان هستید را اضافه کنید؛ بستری‌ها با یک دکمه می‌آیند."
          />
        ) : null}

        {rows.map(({ member, patient, encounter }) => {
          const seen = member.reviewedAt != null;
          const where = locationLabel(encounter ?? undefined);
          return (
            <Card key={member.id} style={{ opacity: seen ? 0.65 : 1 }}>
              <Column gap="sm">
                <Row gap="sm" align="flex-start">
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: seen }}
                    accessibilityLabel={seen ? 'برگرداندن به دیده‌نشده' : 'دیدم'}
                    hitSlop={8}
                    onPress={() =>
                      void setShiftPatientReviewed(member.id, !seen).catch((e) => alertError('ثبت نشد', e))
                    }
                  >
                    <Ionicons
                      name={seen ? 'checkmark-circle' : 'ellipse-outline'}
                      size={26}
                      color={seen ? colors.success : colors.textFaint}
                    />
                  </Pressable>

                  <Pressable
                    style={styles.grow}
                    onPress={() =>
                      void scope.perform(() => router.push({ pathname: '/patient/[id]', params: { id: patient.id } }))
                    }
                  >
                    <Column gap="xxs">
                      <Row gap="xs">
                        <Text variant="bodyStrong" numberOfLines={1} style={styles.grow}>
                          {fullName(patient.firstName, patient.lastName)}
                        </Text>
                        {/* Discharged mid-shift: still on the list for the handoff, but not on the ward. */}
                        {encounter?.dischargedAt ? <Badge label="ترخیص شد" tone="neutral" /> : null}
                      </Row>
                      {where ? (
                        <Text variant="caption" color="textMuted">
                          {where}
                        </Text>
                      ) : null}
                      {member.shiftSummary || patient.summary ? (
                        <Text variant="caption" color="textMuted" numberOfLines={2}>
                          {member.shiftSummary ?? patient.summary}
                        </Text>
                      ) : null}
                    </Column>
                  </Pressable>
                </Row>

                <AutosaveField
                  label="یادداشت تحویل شیفت"
                  initialValue={member.handoffNote}
                  onSave={(value) => updateShiftPatient(member.id, { handoffNote: value })}
                  placeholder="چیزی که نفر بعد باید بداند"
                  multiline
                />

                <Row gap="sm">
                  <Button
                    label="نوت"
                    icon="document-text-outline"
                    variant="secondary"
                    size="sm"
                    onPress={() =>
                      void scope.perform(() =>
                        router.push({ pathname: '/patient/[id]/note', params: { id: patient.id, type: 'progress' } }),
                      )
                    }
                  />
                  <Button
                    label="برداشتن از شیفت"
                    variant="ghost"
                    size="sm"
                    haptic={false}
                    onPress={() => void scope.perform(() => removePatientFromShift(member.id))}
                  />
                </Row>
              </Column>
            </Card>
          );
        })}
        <Button
          label="شیفت‌های قبلی"
          variant="ghost"
          onPress={() => void scope.perform(() => router.push('/shift-history'))}
        />
      </Column>

      <PickerModal
        visible={picking && !error && !patientsError && !busy}
        title="افزودن بیمار به شیفت"
        items={patientItems}
        selectedId={selectedPatientId}
        emptyText={patientsLoading ? 'در حال خواندن…' : 'بیماری پیدا نشد'}
        onClose={() => {
          setPicking(false);
          setSelectedPatientId(null);
        }}
        onSelect={(item) => {
          if (
            !shift ||
            error ||
            patientsError ||
            patientsLoading ||
            writing.current ||
            !patientRows?.some((p) => p.id === item.id)
          )
            return;
          setSelectedPatientId(item.id);
          writing.current = true;
          setBusy(true);
          void addPatientToShift(shift.id, item.id)
            .then(() => {
              setPicking(false);
              setSelectedPatientId(null);
            })
            .catch((e) => alertError('اضافه نشد', e))
            .finally(() => {
              writing.current = false;
              setBusy(false);
            });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
