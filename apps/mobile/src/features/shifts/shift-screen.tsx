import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { PickerModal, type PickerItem } from '@/components/picker-modal';
import { Badge, Button, Card, Column, EmptyState, Input, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { locationLabel } from '@/features/encounters/status';
import { patientListQuery } from '@/features/patients/queries';
import { formatJalaliDateTime } from '@/lib/jalali';
import { fullName, toPersianDigits } from '@/lib/persian';
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
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { data: shifts, error } = useLive(activeShiftQuery());
  const shift = shifts?.[0] ?? null;

  const { data: members } = useLive(shiftPatientsQuery(shift?.id ?? ''), [shift?.id]);
  const rows = useMemo(() => members ?? [], [members]);
  const progress = shiftProgress(rows);

  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: patientRows } = useLive(patientListQuery());

  const patientItems: PickerItem[] = useMemo(
    () =>
      (patientRows ?? []).map((p) => ({
        id: p.id,
        label: fullName(p.firstName, p.lastName),
        sublabel: p.summary,
        keywords: p.searchText,
      })),
    [patientRows],
  );

  async function begin() {
    setBusy(true);
    try {
      await startShift();
    } catch (e) {
      alertError('شیفت شروع نشد', e);
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    if (!shift) return;
    Alert.alert('پایان شیفت؟', 'لیست بیماران این شیفت می‌ماند و بعداً هم می‌توانید ببینیدش.', [
      { text: 'انصراف', style: 'cancel' },
      { text: 'پایان شیفت', onPress: () => void endShift(shift.id) },
    ]);
  }

  if (shifts !== undefined && !shift) {
    return (
      <Screen scroll>
        <Stack.Screen options={{ title: 'شیفت' }} />
        <Column gap="md" style={{ paddingTop: spacing.md }}>
          <ErrorNotice error={error} what="شیفت" />
          <EmptyState
            icon="time-outline"
            title="شیفتی باز نیست"
            description="شیفت را شروع کنید تا بیمارهایی که امشب دستتان است یک‌جا جمع شوند و بدانید کدام را دیده‌اید."
            action={<Button label="شروع شیفت" icon="play" onPress={() => void begin()} loading={busy} />}
          />
        </Column>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'شیفت' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <ErrorNotice error={error} what="شیفت" />

        {shift ? (
          <Card style={{ borderColor: colors.primary, borderWidth: 1 }}>
            <Column gap="sm">
              <Row justify="space-between" align="flex-start">
                <Column gap="xxs" style={styles.grow}>
                  <Text variant="subheading">{[shift.ward, 'شیفت باز'].filter(Boolean).join(' • ')}</Text>
                  <Text variant="caption" color="textMuted">
                    از {formatJalaliDateTime(shift.startAt)}
                  </Text>
                </Column>
                <Badge
                  label={`${toPersianDigits(progress.seen)} از ${toPersianDigits(progress.total)} دیده‌شده`}
                  tone={progress.total > 0 && progress.seen === progress.total ? 'success' : 'neutral'}
                />
              </Row>

              <Row gap="sm">
                <View style={styles.grow}>
                  <Button label="افزودن بیمار" icon="person-add-outline" onPress={() => setPicking(true)} full />
                </View>
                <Button label="پایان شیفت" variant="ghost" onPress={finish} haptic={false} />
              </Row>
            </Column>
          </Card>
        ) : null}

        <SectionHeader title="بیماران این شیفت" count={rows.length} />

        {rows.length === 0 && members !== undefined ? (
          <EmptyState
            icon="people-outline"
            title="هنوز بیماری اضافه نشده"
            description="بیمارهایی که امشب مسئولشان هستید را اینجا اضافه کنید."
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
                    onPress={() => void setShiftPatientReviewed(member.id, !seen)}
                  >
                    <Ionicons
                      name={seen ? 'checkmark-circle' : 'ellipse-outline'}
                      size={26}
                      color={seen ? colors.success : colors.textFaint}
                    />
                  </Pressable>

                  <Pressable
                    style={styles.grow}
                    onPress={() => router.push({ pathname: '/patient/[id]', params: { id: patient.id } })}
                  >
                    <Column gap="xxs">
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {fullName(patient.firstName, patient.lastName)}
                      </Text>
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

                <Input
                  label="یادداشت تحویل شیفت"
                  value={member.handoffNote ?? ''}
                  onChangeText={(v) => void updateShiftPatient(member.id, { handoffNote: v })}
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
                      router.push({ pathname: '/patient/[id]/note', params: { id: patient.id, type: 'progress' } })
                    }
                  />
                  <Button
                    label="برداشتن از شیفت"
                    variant="ghost"
                    size="sm"
                    haptic={false}
                    onPress={() => void removePatientFromShift(member.id)}
                  />
                </Row>
              </Column>
            </Card>
          );
        })}
      </Column>

      <PickerModal
        visible={picking}
        title="افزودن بیمار به شیفت"
        items={patientItems}
        selectedId={null}
        onClose={() => setPicking(false)}
        onSelect={(item) => {
          setPicking(false);
          if (shift) void addPatientToShift(shift.id, item.id);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
