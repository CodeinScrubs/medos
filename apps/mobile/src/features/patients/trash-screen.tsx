import { Alert } from 'react-native';

import { alertError } from '@/components/feedback';
import { Button, Card, Column, EmptyState, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { deletedCapturesQuery, restoreCapture } from '@/features/capture/queries';
import { NOTE_TYPE_LABELS } from '@/features/notes/labels';
import { deletedNotesQuery, restoreNote } from '@/features/notes/queries';
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
  const { spacing } = useTheme();
  const { data } = useLive(deletedPatientsQuery());
  const { data: captures } = useLive(deletedCapturesQuery());
  const { data: notes } = useLive(deletedNotesQuery());
  const rows = data ?? [];
  const captureRows = captures ?? [];
  const noteRows = notes ?? [];

  return (
    <Screen scroll>
      <Column gap="sm" style={{ paddingTop: spacing.md }}>
        <Text variant="caption" color="textMuted">
          پرونده‌ها، نوت‌ها و ثبت‌های سریعی که حذف کرده‌اید اینجا می‌مانند و قابل برگرداندن‌اند. پرونده با همه‌ی نوت‌ها،
          آزمایش‌ها و عکس‌هایش برمی‌گردد.
        </Text>

        {rows.length === 0 && captureRows.length === 0 && noteRows.length === 0 ? (
          <EmptyState icon="trash-outline" title="چیزی حذف نشده" />
        ) : null}

        {rows.length > 0 ? (
          <>
            <SectionHeader title="بیماران" count={rows.length} />
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
                    onPress={() =>
                      void restorePatient(p.id)
                        .then(() =>
                          Alert.alert('برگردانده شد', `${p.firstName} ${p.lastName} دوباره در لیست بیماران است.`),
                        )
                        .catch((e) => alertError('برگردانده نشد', e))
                    }
                  />
                </Row>
              </Card>
            ))}
          </>
        ) : null}

        {noteRows.length > 0 ? (
          <>
            <SectionHeader title="نوت‌ها" count={noteRows.length} />
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
                    onPress={() => void restoreNote(note.id).catch((e) => alertError('برگردانده نشد', e))}
                  />
                </Row>
              </Card>
            ))}
          </>
        ) : null}

        {captureRows.length > 0 ? (
          <>
            <SectionHeader title="ثبت‌های سریع" count={captureRows.length} />
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
                    onPress={() => void restoreCapture(c.id).catch((e) => alertError('برگردانده نشد', e))}
                  />
                </Row>
              </Card>
            ))}
          </>
        ) : null}
      </Column>
    </Screen>
  );
}
