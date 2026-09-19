import { Alert } from 'react-native';

import { Button, Card, Column, EmptyState, Row, Screen, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { formatJalaliDateTime } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { deletedPatientsQuery, restorePatient } from './queries';

/**
 * Deleted patients, with a way back. MedOS never hard-deletes clinical data;
 * this screen is what makes that promise useful rather than theoretical.
 */
export function TrashScreen() {
  const { spacing } = useTheme();
  const { data } = useLive(deletedPatientsQuery());
  const rows = data ?? [];

  return (
    <Screen scroll>
      <Column gap="sm" style={{ paddingTop: spacing.md }}>
        <Text variant="caption" color="textMuted">
          پرونده‌هایی که حذف کرده‌اید اینجا می‌مانند و با همه‌ی نوت‌ها، آزمایش‌ها و عکس‌هایشان قابل برگرداندن‌اند.
        </Text>
        {rows.length === 0 ? (
          <EmptyState icon="trash-outline" title="چیزی حذف نشده" />
        ) : (
          rows.map((p) => (
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
          ))
        )}
      </Column>
    </Screen>
  );
}
