import { useRouter } from 'expo-router';
import { useNavigation } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';

import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, Card, Column, EmptyState, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { deletedCapturesQuery, restoreCapture } from '@/features/capture/queries';
import { NOTE_TYPE_LABELS } from '@/features/notes/labels';
import { deletedNotesQuery, restoreNote } from '@/features/notes/queries';
import { withDatasetWrite } from '@/lib/dataset-write';
import { formatJalaliDateTime } from '@/lib/jalali';
import { fullName } from '@/lib/persian';
import { useTheme } from '@/theme';

import { deletedPatientsQuery, restorePatient } from './queries';

/**
 * What was deleted, with a way back.
 *
 * MedOS never hard-deletes; this screen is what makes that promise useful
 * rather than theoretical. Not everything deletable is here yet — when a
 * screen's delete message says "from the trash", it has to be this one.
 */
export function TrashScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { generation, stale } = useDatasetIntent();
  const { spacing } = useTheme();
  const [patientLimit, setPatientLimit] = useState(50);
  const [noteLimit, setNoteLimit] = useState(50);
  const [captureLimit, setCaptureLimit] = useState(50);
  const patientRead = useLive(deletedPatientsQuery(patientLimit + 1), [patientLimit]);
  const noteRead = useLive(deletedNotesQuery(noteLimit + 1), [noteLimit]);
  const captureRead = useLive(deletedCapturesQuery(captureLimit + 1), [captureLimit]);
  const rows = (patientRead.data ?? []).slice(0, patientLimit);
  const noteRows = (noteRead.data ?? []).slice(0, noteLimit);
  const captureRows = (captureRead.data ?? []).slice(0, captureLimit);
  const [busy, setBusy] = useState(false);
  const acting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const ready = [patientRead, noteRead, captureRead].every((read) => read.data !== undefined && !read.error);
  const locked = busy || stale || !ready;

  async function restore(work: () => Promise<void>) {
    // State alone cannot block two presses in the same render. Retain original
    // admission through reminders and audit, not just the first SQL statement.
    if (acting.current || !mounted.current || !ready || !navigation.isFocused()) return;
    acting.current = true;
    setBusy(true);
    try {
      await withDatasetWrite(generation, work);
    } catch (e) {
      if (mounted.current && navigation.isFocused()) alertError('برگردانده نشد', e);
    } finally {
      acting.current = false;
      if (mounted.current) {
        setBusy(false);
        patientRead.retry();
        noteRead.retry();
        captureRead.retry();
      }
    }
  }

  return (
    <Screen scroll>
      <Column gap="sm" style={{ paddingTop: spacing.md }}>
        <Text variant="caption" color="textMuted">
          بازیابی بیمار، مواردی را که جداگانه حذف کرده‌اید برنمی‌گرداند.
        </Text>

        <ErrorNotice error={patientRead.error} what="بیماران حذف‌شده" onRetry={patientRead.retry} />
        <ErrorNotice error={noteRead.error} what="نوت‌های حذف‌شده" onRetry={noteRead.retry} />
        <ErrorNotice error={captureRead.error} what="ثبت‌های حذف‌شده" onRetry={captureRead.retry} />
        {[patientRead, noteRead, captureRead].some((read) => read.loading) ? (
          <Text variant="caption" color="textMuted">
            در حال خواندن…
          </Text>
        ) : null}
        {stale ? (
          <Column gap="xs">
            <Text variant="caption" color="textMuted">
              اطلاعات از بکاپ جایگزین شده؛ انتخاب قبلی قابل اعمال نیست.
            </Text>
            <Button
              label="باز کردن سطل زبالهٔ جدید"
              variant="secondary"
              onPress={() => {
                if (navigation.isFocused()) router.replace('/trash');
              }}
            />
          </Column>
        ) : null}
        {ready && !stale && rows.length === 0 && captureRows.length === 0 && noteRows.length === 0 ? (
          <EmptyState icon="trash-outline" title="چیزی حذف نشده" />
        ) : null}

        {rows.length > 0 ? (
          <>
            <SectionHeader
              title="بیماران"
              count={ready && !stale && patientRead.data!.length <= patientLimit ? rows.length : undefined}
            />
            {rows.map((p) => (
              <Card key={p.id}>
                <Row justify="space-between" gap="sm">
                  <Column gap="xxs" style={{ flex: 1 }}>
                    <Text variant="subheading">
                      {p.firstName} {p.lastName}
                    </Text>
                    {p.deletedAt ? (
                      <Text variant="tiny" color="textFaint">
                        حذف در {formatJalaliDateTime(p.deletedAt)}
                      </Text>
                    ) : null}
                  </Column>
                  <Button
                    label="برگرداندن"
                    icon="arrow-undo-outline"
                    size="sm"
                    variant="secondary"
                    disabled={locked}
                    onPress={() => void restore(() => restorePatient(p.id, p))}
                  />
                </Row>
              </Card>
            ))}
            {!stale && !patientRead.error && (patientRead.data?.length ?? 0) > patientLimit ? (
              <Button
                label="بیماران بیشتر"
                variant="ghost"
                disabled={busy}
                onPress={() => setPatientLimit((n) => n + 50)}
              />
            ) : null}
          </>
        ) : null}

        {noteRows.length > 0 ? (
          <>
            <SectionHeader
              title="نوت‌ها"
              count={ready && !stale && noteRead.data!.length <= noteLimit ? noteRows.length : undefined}
            />
            {noteRows.map(({ note, patient }) => (
              <Card key={note.id}>
                <Row justify="space-between" gap="sm">
                  <Column gap="xxs" style={{ flex: 1 }}>
                    <Text variant="captionStrong" color="primary">
                      {NOTE_TYPE_LABELS[note.type]}
                      {patient ? ` — ${fullName(patient.firstName, patient.lastName)}` : ''}
                    </Text>
                    <Text variant="body" numberOfLines={2}>
                      {note.title || note.body || note.subjective || note.assessment || note.plan || 'بدون متن'}
                    </Text>
                    {note.deletedAt ? (
                      <Text variant="tiny" color="textFaint">
                        حذف در {formatJalaliDateTime(note.deletedAt)}
                      </Text>
                    ) : null}
                  </Column>
                  <Button
                    label="برگرداندن"
                    icon="arrow-undo-outline"
                    size="sm"
                    variant="secondary"
                    disabled={locked}
                    onPress={() => void restore(() => restoreNote(note.id, note))}
                  />
                </Row>
              </Card>
            ))}
            {!stale && !noteRead.error && (noteRead.data?.length ?? 0) > noteLimit ? (
              <Button
                label="نوت‌های بیشتر"
                variant="ghost"
                disabled={busy}
                onPress={() => setNoteLimit((n) => n + 50)}
              />
            ) : null}
          </>
        ) : null}

        {captureRows.length > 0 ? (
          <>
            <SectionHeader
              title="ثبت‌های سریع"
              count={ready && !stale && captureRead.data!.length <= captureLimit ? captureRows.length : undefined}
            />
            {captureRows.map((c) => (
              <Card key={c.id}>
                <Row justify="space-between" gap="sm">
                  <Column gap="xxs" style={{ flex: 1 }}>
                    <Text variant="body" numberOfLines={2}>
                      {c.text ?? (c.kind === 'voice' ? 'وویس بدون متن' : 'بدون متن')}
                    </Text>
                    {c.deletedAt ? (
                      <Text variant="tiny" color="textFaint">
                        حذف در {formatJalaliDateTime(c.deletedAt)}
                      </Text>
                    ) : null}
                  </Column>
                  <Button
                    label="برگرداندن"
                    icon="arrow-undo-outline"
                    size="sm"
                    variant="secondary"
                    disabled={locked}
                    onPress={() => void restore(() => restoreCapture(c.id, c))}
                  />
                </Row>
              </Card>
            ))}
            {!stale && !captureRead.error && (captureRead.data?.length ?? 0) > captureLimit ? (
              <Button
                label="ثبت‌های بیشتر"
                variant="ghost"
                disabled={busy}
                onPress={() => setCaptureLimit((n) => n + 50)}
              />
            ) : null}
          </>
        ) : null}
      </Column>
    </Screen>
  );
}
