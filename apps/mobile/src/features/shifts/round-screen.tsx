import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { AutosaveField } from '@/components/autosave-field';
import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { ScreenOptions } from '@/components/screen-options';
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

import { saveShiftPatientText, setShiftPatientReviewed } from './queries';
import { indexOfMember, nextIndex, roundProgress, startIndex } from './round';
import { ShiftWorkspaceNotice, useShiftWorkspace } from './workspace';

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
  const { colors, spacing } = useTheme();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const [busy, setBusy] = useState(false);
  const acting = useRef(false);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  const { shift, rows, error, loading, blocked, changing, saving, retry } = useShiftWorkspace();

  // The cursor follows a person, not a position: somebody can be added to or
  // taken off the shift from another screen while this one is open, and
  // following the index would silently move the round onto a patient nobody
  // looked at.
  const [currentId, setCurrentId] = useState<string | null>(null);
  const index = indexOfMember(rows, currentId) ?? startIndex(rows);
  const current = index == null ? null : rows[index];
  const progress = blocked ? null : roundProgress(rows);

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

  async function advance(markSeen: boolean) {
    if (acting.current || progress === null || !current || index == null) return;
    acting.current = true;
    setBusy(true);
    try {
      await scope.perform(() => (markSeen ? seen(current.member.id, index) : skip(index)));
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }

  if (error && !shift) {
    return (
      <Screen>
        <ScreenOptions options={{ title: 'راند' }} />
        <ErrorNotice error={error} what="راند" onRetry={retry} />
        <ShiftWorkspaceNotice changing={changing} saving={saving} onRetry={retry} />
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen>
        <ScreenOptions options={{ title: 'راند' }} />
        <ErrorNotice error={error} what="راند" onRetry={retry} />
        <Text variant="caption" color="textMuted">
          در حال خواندن…
        </Text>
      </Screen>
    );
  }

  if (!blocked && rows.length === 0) {
    return (
      <Screen scroll>
        <ScreenOptions options={{ title: 'راند' }} />
        <Column gap="md" style={{ paddingTop: spacing.md }}>
          <ErrorNotice error={error} what="راند" onRetry={retry} />
          <EmptyState
            icon="walk-outline"
            title={shift ? 'کسی روی این شیفت نیست' : 'شیفتی باز نیست'}
            description={
              shift
                ? 'اول بیماران این شیفت را اضافه کنید، بعد راند را شروع کنید.'
                : 'راند از روی بیمارهای شیفت باز ساخته می‌شود.'
            }
            action={<Button label="رفتن به شیفت" icon="arrow-back" onPress={() => router.replace('/shift')} />}
          />
        </Column>
      </Screen>
    );
  }

  if (progress?.done) {
    return (
      <Screen scroll>
        <ScreenOptions options={{ title: 'راند' }} />
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
        <ScreenOptions options={{ title: 'راند' }} />
        <ErrorNotice error={error} what="وضعیت راند" onRetry={retry} />
        <ShiftWorkspaceNotice changing={changing} saving={saving} onRetry={retry} />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <ScreenOptions options={{ title: 'راند' }} />
      <KeyboardAwareScrollView
        style={styles.grow}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.huge }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={spacing.xl}
      >
        <Column gap="md">
          <ErrorNotice error={error} what="راند" onRetry={retry} />
          <ShiftWorkspaceNotice changing={changing} saving={saving} onRetry={retry} />

          <Row justify="space-between" align="center">
            <Text variant="caption" color="textMuted">
              بیمار {toPersianDigits(index + 1)} از {toPersianDigits(progress?.total ?? rows.length)}
            </Text>
            <Badge
              label={progress ? `${toPersianDigits(progress.seen)} دیده‌شده` : 'وضعیت بیماران نامشخص'}
              tone={progress && progress.seen > 0 ? 'success' : 'neutral'}
            />
          </Row>

          <RoundCard key={`${current.member.shiftId}:${current.member.id}:${current.patient.id}`} row={current} />
        </Column>
      </KeyboardAwareScrollView>

      {/* Screen owns the bottom safe edge. Hiding only the footer gives typing
          its space without unmounting the card or its registered savers. */}
      {!keyboardVisible ? (
        <Column
          gap="xs"
          style={{
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <Row gap="sm">
            <View style={styles.grow}>
              <Button
                label="دیدم و بعدی"
                icon="checkmark-circle-outline"
                onPress={() => void advance(true)}
                loading={busy}
                disabled={progress === null}
                full
              />
            </View>
            <View style={styles.grow}>
              <Button
                label="بعدی"
                icon="arrow-back"
                variant="secondary"
                haptic={false}
                accessibilityHint="بدون ثبتِ دیده‌شدن"
                disabled={busy || progress === null}
                onPress={() => void advance(false)}
                full
              />
            </View>
          </Row>

          <Text variant="tiny" color="textFaint">
            بعدی: بدون ثبتِ دیده‌شدن
          </Text>
        </Column>
      ) : null}
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

  const {
    data: notes,
    error: notesError,
    retry: retryNotes,
  } = useLive(latestPatientNoteQuery(patient.id), [patient.id]);
  const {
    data: consults,
    error: consultsError,
    retry: retryConsults,
  } = useLive(patientConsultsQuery(patient.id), [patient.id]);
  const lastNote = (notes ?? [])[0] ?? null;
  const where = locationLabel(encounter ?? undefined);
  const elapsed =
    encounter && !encounter.isActive && !encounter.dischargedAt
      ? null
      : formatAdmissionElapsed(
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
                {encounter?.dischargedAt ? <Badge label="ترخیص شد" tone="neutral" /> : null}
                {encounter && !encounter.isActive && !encounter.dischargedAt ? (
                  <Badge label="دورهٔ قبلی؛ پرونده را مرور کنید" />
                ) : null}
                {member.reviewedAt ? <Badge label="دیده شد" tone="success" /> : null}
              </Row>
              {patient.summary ? (
                <Text variant="caption" color="textMuted">
                  {patient.summary}
                </Text>
              ) : null}
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

          <AllergyBanner text={patient.allergies} />

          <AutosaveField
            label="نکته‌ی این شیفت"
            initialValue={member.shiftSummary}
            onSave={(value) => saveShiftPatientText(member, { shiftSummary: value })}
            placeholder="یک خط که در این شیفت مهم است"
            multiline
          />
        </Column>
      </Card>

      <ErrorNotice error={notesError} what="آخرین نوت" onRetry={retryNotes} />
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

      <ErrorNotice error={consultsError} what="کانسالت‌ها" onRetry={retryConsults} />
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
        onSave={(value) => saveShiftPatientText(member, { handoffNote: value })}
        placeholder="چیزی که نفر بعد باید بداند"
        multiline
      />
    </Column>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
