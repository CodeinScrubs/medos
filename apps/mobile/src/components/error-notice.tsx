import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';

import { Card, Column, Row, Text } from '@/components/ui';
import { redactErrorText } from '@/lib/redact';
import { logError } from '@/platform/error-log';
import { useTheme } from '@/theme';

/**
 * Shown where a list would be when reading the database failed.
 *
 * Without it, a failed read looks exactly like "this patient has no drugs" —
 * which is the wrong thing to tell someone on a ward round. The error is also
 * written to the on-phone log, since nobody is watching a console here.
 */
export function ErrorNotice({ error, what }: { error: Error | undefined; what: string }) {
  const { colors, spacing } = useTheme();

  useEffect(() => {
    if (error) logError(error, { source: 'handled', context: what });
  }, [error, what]);

  if (!error) return null;

  return (
    <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.danger }}>
      <Row gap="sm" align="flex-start">
        <Ionicons name="warning-outline" size={20} color={colors.danger} />
        <Column gap="xxs" style={{ flex: 1 }}>
          <Text variant="bodyStrong" style={{ color: colors.danger }}>
            {what} خوانده نشد
          </Text>
          <Text variant="tiny" style={{ color: colors.danger }}>
            اطلاعات ممکن است به‌روز نباشد. پیش از خروج، از ذخیره‌شدن نوشته‌ها مطمئن شوید.
          </Text>
          <Text variant="tiny" color="textFaint" ltr selectable style={{ marginTop: spacing.xxs }}>
            {redactErrorText(error.message)}
          </Text>
        </Column>
      </Row>
    </Card>
  );
}
