import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { PickerModal, type PickerItem } from '@/components/picker-modal';
import { ScreenOptions } from '@/components/screen-options';
import { Badge, Button, Card, Column, EmptyState, IconButton, Input, Row, Screen, Text } from '@/components/ui';
import { useNow } from '@/components/use-now';
import { useLive } from '@/db/use-live';
import { patientPickerSublabel } from '@/features/patients/logic';
import { patientListQuery } from '@/features/patients/queries';
import { withDatasetWrite } from '@/lib/dataset-write';
import { formatJalaliDateTime } from '@/lib/jalali';
import { fullName, joinLabels, toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { matchesShiftDeck } from './deck';
import { addPatientToShift, endShift, reorderShiftPatients, shiftProgress, startShift } from './queries';
import { ShiftPatientRow } from './shift-patient-row';
import { ShiftWorkspaceNotice, useShiftWorkspace } from './workspace';

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
  const { shift, rows, error, loading, blocked, changing, shiftChanging, saving, retry } = useShiftWorkspace();
  const progress = blocked ? null : shiftProgress(rows);
  const now = new Date(useNow());
  const [search, setSearch] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const shownCount = rows.filter((row) => matchesShiftDeck(row, search)).length;

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
    retry();
    if (patientsError) retryPatients();
  }

  async function addAllAdmitted() {
    if (!shift || !progress || patientsError || patientsLoading || writing.current) return;
    writing.current = true;
    setBusy(true);
    try {
      await withDatasetWrite(scope.generation, async () => {
        for (const p of admittedNotInShift) await addPatientToShift(shift.id, p.id);
      });
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
      await withDatasetWrite(scope.generation, () => startShift());
    } catch (e) {
      alertError('شیفت شروع نشد', e);
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  function move(index: number, direction: -1 | 1) {
    if (!shift || blocked || writing.current) return;
    const next = index + direction;
    if (next < 0 || next >= rows.length) return;
    const expected = rows.map((r) => r.member.id);
    const order = [...expected];
    [order[index], order[next]] = [order[next]!, order[index]!];
    writing.current = true;
    setBusy(true);
    void scope
      .perform(() => reorderShiftPatients(shift.id, order, expected, scope.generation))
      .finally(() => {
        writing.current = false;
        setBusy(false);
      });
  }

  function finish() {
    if (!shift || blocked) return;
    Alert.alert('پایان شیفت؟', 'لیست بیماران این شیفت می‌ماند و بعداً هم می‌توانید ببینیدش.', [
      { text: 'انصراف', style: 'cancel' },
      { text: 'پایان شیفت', onPress: () => void scope.perform(() => endShift(shift.id)) },
    ]);
  }

  if (error && !shift) {
    return (
      <Screen scroll edges={[]}>
        <ScreenOptions options={{ title: 'شیفت' }} />
        <Column gap="md" style={{ paddingTop: spacing.md }}>
          <ErrorNotice error={error} what="شیفت" onRetry={retryReads} />
          <ShiftWorkspaceNotice changing={changing} saving={saving} onRetry={retry} />
          <Button label="شیفت‌های قبلی" variant="ghost" onPress={() => router.push('/shift-history')} />
        </Column>
      </Screen>
    );
  }

  if (!loading && !shift && !error && !changing) {
    return (
      <Screen scroll edges={[]}>
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
    <Screen scroll edges={[]}>
      <ScreenOptions options={{ title: 'شیفت' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <ErrorNotice error={error ?? patientsError} what="شیفت" onRetry={retryReads} />
        <ShiftWorkspaceNotice changing={changing} saving={saving} onRetry={retry} />
        {loading ? (
          <Text variant="caption" color="textMuted">
            در حال خواندن…
          </Text>
        ) : null}

        {shift ? (
          <Card style={{ borderColor: colors.primary, borderWidth: 1, padding: spacing.md }}>
            <Column gap="sm">
              <Row justify="space-between" align="flex-start">
                <Column gap="xxs" style={styles.grow}>
                  <Text variant="subheading">{joinLabels([shift.ward, shiftChanging ? 'شیفت قبلی' : 'شیفت باز'])}</Text>
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
                    size="sm"
                    full
                  />
                </View>
                <Button
                  label="افزودن بیمار"
                  icon="person-add-outline"
                  variant="secondary"
                  size="sm"
                  disabled={busy || blocked}
                  onPress={() => setPicking(true)}
                />
                <IconButton
                  label={optionsOpen ? 'بستن گزینه‌های شیفت' : 'گزینه‌های شیفت'}
                  icon={optionsOpen ? 'chevron-up-outline' : 'ellipsis-horizontal'}
                  onPress={() => setOptionsOpen((value) => !value)}
                />
              </Row>

              {optionsOpen ? (
                <Column gap="xs">
                  {progress && admittedNotInShift.length > 0 ? (
                    <Button
                      label={`افزودن همه‌ی بستری‌ها (${toPersianDigits(admittedNotInShift.length)})`}
                      icon="people-outline"
                      variant="secondary"
                      size="sm"
                      loading={busy}
                      onPress={() => void addAllAdmitted()}
                    />
                  ) : null}
                  <Button
                    label="پایان شیفت"
                    variant="ghost"
                    size="sm"
                    onPress={finish}
                    disabled={blocked}
                    haptic={false}
                  />
                </Column>
              ) : null}
            </Column>
          </Card>
        ) : null}

        <Row gap="sm" justify="space-between">
          <Column gap="xxs" style={styles.grow}>
            <Text variant="subheading">بیماران این شیفت</Text>
            {rows.length > 0 ? (
              <Text variant="caption" color="textMuted">
                {toPersianDigits(shownCount)} از {toPersianDigits(rows.length)}
              </Text>
            ) : null}
          </Column>
          {rows.length > 0 ? (
            <Button
              label={ordering ? 'پایان مرتب‌کردن' : 'ترتیب راند'}
              variant="ghost"
              size="sm"
              disabled={blocked || busy}
              onPress={() => setOrdering((value) => !value)}
            />
          ) : null}
        </Row>
        {rows.length > 0 ? (
          <>
            <Input
              label="جستجو در شیفت"
              value={search}
              onChangeText={setSearch}
              icon="search-outline"
              placeholder="نام، تخت، تشخیص یا کار بعدی…"
            />
            {shownCount === 0 ? (
              <Text variant="caption" color="textMuted">
                در این شیفت پیدا نشد.
              </Text>
            ) : null}
          </>
        ) : null}

        {progress?.total === 0 ? (
          <EmptyState
            icon="people-outline"
            title="هنوز بیماری اضافه نشده"
            description="بیمارانی که در این شیفت مسئولشان هستید را اضافه کنید؛ بستری‌ها با یک دکمه می‌آیند."
          />
        ) : null}

        {rows.map((row, index) => (
          <View key={row.member.id} style={!matchesShiftDeck(row, search) ? { display: 'none' } : undefined}>
            <ShiftPatientRow
              row={row}
              now={now}
              blocked={blocked || busy}
              ordering={ordering}
              first={index === 0}
              last={index === rows.length - 1}
              onUp={() => move(index, -1)}
              onDown={() => move(index, 1)}
            />
          </View>
        ))}
        <Button
          label="شیفت‌های قبلی"
          variant="ghost"
          onPress={() => void scope.perform(() => router.push('/shift-history'))}
        />
      </Column>

      <PickerModal
        visible={picking && !blocked && !patientsError && !busy}
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
            blocked ||
            patientsError ||
            patientsLoading ||
            writing.current ||
            !patientRows?.some((p) => p.id === item.id)
          )
            return;
          setSelectedPatientId(item.id);
          writing.current = true;
          setBusy(true);
          void withDatasetWrite(scope.generation, () => addPatientToShift(shift.id, item.id))
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
