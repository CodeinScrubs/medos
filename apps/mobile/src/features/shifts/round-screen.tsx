import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AutosaveField } from '@/components/autosave-field';
import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Badge, Button, Card, Column, EmptyState, Row, Screen, Text } from '@/components/ui';
import { useNow } from '@/components/use-now';
import type { Encounter, Patient, ShiftPatient } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { ConsultsBrief } from '@/features/consults/consults-brief';
import { patientConsultsQuery } from '@/features/consults/queries';
import { admissionElapsed, formatAdmissionElapsed } from '@/features/encounters/logic';
import { locationLabel } from '@/features/encounters/status';
import { notePreview } from '@/features/notes/logic';
import { latestPatientNoteQuery } from '@/features/notes/queries';
import { AllergyBanner } from '@/features/patients/patient-header';
import { TasksSection } from '@/features/tasks/tasks-section';
import { formatJalaliDateTime } from '@/lib/jalali';
import { fullName, toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { activeShiftQuery, setShiftPatientReviewed, shiftPatientsQuery, updateShiftPatient } from './queries';
import { indexOfMember, nextIndex, roundProgress, startIndex } from './round';

/**
 * The round: one patient filling the screen, in the order of the shift.
 *
 * A list is the wrong shape for a ward round. Reading one means looking away
 * from the person in front of you and then finding your place again, and the
 * place you find is rarely the one you left. Here there is one card, one set
 * of buttons, and a counter.
 *
 * It stores nothing of its own. The only durable fact a round produces — that
 * somebody has been seen — already belongs to the shift.
 */
export function RoundScreen() {
  return (
    <AutosaveScope>
      <RoundScreenContent />
    </AutosaveScope>
  );
}

function RoundScreenContent() {
  const scope = useAutosaveScope()!;
  const router = useRouter();
  const { spacing } = useTheme();

  const { data: shifts, error } = useLive(activeShiftQuery());
  const shift = shifts?.[0] ?? null;
  const { data: members, error: membersError } = useLive(shiftPatientsQuery(shift?.id ?? ''), [shift?.id]);
  const rows = useMemo(() => (members ?? []).filter((row) => row.member.shiftId === shift?.id), [members, shift?.id]);

  // The cursor follows a person, not a position: somebody can be added to or
  // taken off the shift from another screen while this one is open, and
  // following the index would silently move the round onto a patient nobody
  // looked at.
  const [currentId, setCurrentId] = useState<string | null>(null);
  const index = indexOfMember(rows, currentId) ?? startIndex(rows);
  const current = index == null ? null : rows[index];
  const progress = roundProgress(rows);

  function goTo(next: number | null) {
    setCurrentId(next == null ? null : (rows[next]?.member.id ?? null));
  }

  /** Seen: they are done, so the round moves past them or ends. */
  async function seen(memberId: string, at: number) {
    try {
      await setShiftPatientReviewed(memberId, true);
      goTo(nextIndex(rows, at));
    } catch (e) {
      alertError('ثبت نشد', e);
    }
  }

  /** Skipped: still owed a visit, so the round can come back to them. */
  function skip(at: number) {
    goTo(nextIndex(rows, at, { includeCurrent: true }));
  }

  if (error || membersError) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'راند' }} />
        <ErrorNotice error={error ?? membersError} what="راند" />
      </Screen>
    );
  }

  if (members !== undefined && rows.length === 0) {
    return (
      <Screen scroll>
        <Stack.Screen options={{ title: 'راند' }} />
        <Column gap="md" style={{ paddingTop: spacing.md }}>
          <ErrorNotice error={error} what="راند" />
          <EmptyState
            icon="walk-outline"
            title={shift ? 'کسی روی این شیفت نیست' : 'شیفتی باز نیست'}
            description={
              shift
                ? 'اول بیمارهای امشب را به شیفت اضافه کنید، بعد راند را شروع کنید.'
                : 'راند از روی بیمارهای شیفت باز ساخته می‌شود.'
            }
            action={<Button label="رفتن به شیفت" icon="arrow-back" onPress={() => router.replace('/shift')} />}
          />
        </Column>
      </Screen>
    );
  }

  if (progress.done) {
    return (
      <Screen scroll>
        <Stack.Screen options={{ title: 'راند' }} />
        <Column gap="md" style={{ paddingTop: spacing.md }}>
          <EmptyState
            icon="checkmark-done-outline"
            title="راند تمام شد"
            description={`هر ${toPersianDigits(progress.total)} بیمار این شیفت دیده شدند.`}
            action={<Button label="بازگشت به شیفت" icon="list-outline" onPress={() => router.replace('/shift')} />}
          />
        </Column>
      </Screen>
    );
  }

  if (!current || index == null) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'راند' }} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'راند' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <ErrorNotice error={error} what="راند" />

        <Row justify="space-between" align="center">
          <Text variant="caption" color="textMuted">
            بیمار {toPersianDigits(index + 1)} از {toPersianDigits(progress.total)}
          </Text>
          <Badge
            label={`${toPersianDigits(progress.seen)} دیده‌شده`}
            tone={progress.seen > 0 ? 'success' : 'neutral'}
          />
        </Row>

        <RoundCard key={current.member.id} row={current} />

        <Row gap="sm">
          <View style={styles.grow}>
            <Button
              label="دیدم و بعدی"
              icon="checkmark-circle-outline"
              onPress={() => void scope.perform(() => seen(current.member.id, index))}
              full
            />
          </View>
          <Button
            label="بعدی"
            icon="arrow-back"
            variant="secondary"
            haptic={false}
            onPress={() => void scope.perform(() => skip(index))}
          />
        </Row>

        <Text variant="tiny" color="textFaint" style={{ marginBottom: spacing.xl }}>
          «بعدی» کسی را دیده‌شده علامت نمی‌زند؛ همان‌جا در صف می‌ماند تا دوباره برسید به او.
        </Text>
      </Column>
    </Screen>
  );
}

type RoundRow = { member: ShiftPatient; patient: Patient; encounter: Encounter | null };

/**
 * Everything worth knowing at the bedside, and nothing else.
 *
 * What is here is what gets asked on a round: where they are, what day of the
 * admission it is, what they are allergic to, the last thing written, what is
 * still owed, and what is left to do. The full record is one tap away and
 * deliberately not inlined — a round card that scrolls is a list again.
 */
function RoundCard({ row }: { row: RoundRow }) {
  const scope = useAutosaveScope()!;
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { member, patient, encounter } = row;
  const now = useNow();

  const { data: notes, error: notesError } = useLive(latestPatientNoteQuery(patient.id), [patient.id]);
  const { data: consults, error: consultsError } = useLive(patientConsultsQuery(patient.id), [patient.id]);
  const lastNote = (notes ?? [])[0] ?? null;
  const where = locationLabel(encounter ?? undefined);
  const elapsed = formatAdmissionElapsed(
    admissionElapsed(
      encounter?.admittedAt,
      encounter?.admittedAtHasTime ?? false,
      encounter?.dischargedAt ?? new Date(now),
    ),
  );

  return (
    <Column gap="md">
      <Card>
        <Column gap="sm">
          <Row justify="space-between" align="flex-start" gap="sm">
            <Column gap="xxs" style={styles.grow}>
              <Text variant="heading">{fullName(patient.firstName, patient.lastName)}</Text>
              <Row gap="xs" wrap>
                {where ? (
                  <Text variant="caption" color="textMuted">
                    {where}
                  </Text>
                ) : null}
                {elapsed ? <Badge label={elapsed} /> : null}
                {member.reviewedAt ? <Badge label="دیده شد" tone="success" /> : null}
              </Row>
            </Column>
            <Button
              label="پرونده"
              icon="folder-open-outline"
              variant="ghost"
              size="sm"
              haptic={false}
              onPress={() =>
                void scope.perform(() => router.push({ pathname: '/patient/[id]', params: { id: patient.id } }))
              }
            />
          </Row>

          {patient.allergies ? <AllergyBanner text={patient.allergies} /> : null}

          <AutosaveField
            label="امشب درباره‌ی این بیمار"
            initialValue={member.shiftSummary}
            onSave={(value) => updateShiftPatient(member.id, { shiftSummary: value })}
            placeholder={patient.summary ?? 'یک خط که امشب مهم است'}
            multiline
          />
        </Column>
      </Card>

      <ErrorNotice error={notesError} what="آخرین نوت" />
      {notesError || notes === undefined ? null : lastNote ? (
        <Card tone="alt">
          <Column gap="xxs">
            <Row justify="space-between" gap="sm">
              <Text variant="captionStrong">آخرین نوت</Text>
              <Text variant="tiny" color="textFaint">
                {formatJalaliDateTime(lastNote.noteDate)}
              </Text>
            </Row>
            <Text variant="caption" color="textMuted" numberOfLines={4}>
              {notePreview(lastNote) || lastNote.title || '—'}
            </Text>
          </Column>
        </Card>
      ) : (
        <Row gap="sm" align="center">
          <Ionicons name="document-outline" size={16} color={colors.textFaint} />
          <Text variant="caption" color="textFaint">
            هنوز نوتی برای این بیمار نوشته نشده.
          </Text>
        </Row>
      )}

      <ErrorNotice error={consultsError} what="کانسالت‌ها" />
      {!consultsError && consults !== undefined ? <ConsultsBrief rows={consults} /> : null}

      <TasksSection patientId={patient.id} shiftId={member.shiftId} title="کارهای این بیمار" limit={6} />

      <Row gap="sm" wrap style={{ marginTop: spacing.xxs }}>
        <Button
          label="نوت پیشرفت"
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
          label="ثبت سریع"
          icon="create-outline"
          variant="secondary"
          size="sm"
          onPress={() =>
            void scope.perform(() => router.push({ pathname: '/capture', params: { patientId: patient.id } }))
          }
        />
      </Row>

      <AutosaveField
        label="یادداشت تحویل شیفت"
        initialValue={member.handoffNote}
        onSave={(value) => updateShiftPatient(member.id, { handoffNote: value })}
        placeholder="چیزی که نفر بعد باید بداند"
        multiline
      />
    </Column>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
