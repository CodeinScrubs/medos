import { Alert } from 'react-native';

import { Button, Card, Column, EmptyState, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { deletedCapturesQuery, restoreCapture } from '@/features/capture/queries';
import { formatJalaliDateTime } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { deletedPatientsQuery, restorePatient } from './queries';

/**
 * What was deleted, with a way back.
 *
 * MedOS never hard-deletes; this screen is what makes that promise useful
 * rather than theoretical. Not everything deletable is here yet — when a
 * screen offers a trash it has to be this one, or the offer is a lie.
 */
export function TrashScreen() {
  const { spacing } = useTheme();
  const { data } = useLive(deletedPatientsQuery());
  const { data: captures } = useLive(deletedCapturesQuery());
  const rows = data ?? [];
  const captureRows = captures ?? [];

  return (
    <Screen scroll>
      <Column gap="sm" style={{ paddingTop: spacing.md }}>
        <Text variant="caption" color="textMuted">
          پرونده‌هایی که حذف کرده‌اید اینجا می‌مانند و با همه‌ی نوت‌ها، آزمایش‌ها و عکس‌هایشان قابل برگرداندن‌اند.
        </Text>

        {rows.length === 0 && captureRows.length === 0 ? (
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
                      void restorePatient(p.id).then(() =>
                        Alert.alert('برگردانده شد', `${p.firstName} ${p.lastName} دوباره در لیست بیماران است.`),
                      )
                    }
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
                    onPress={() => void restoreCapture(c.id)}
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
