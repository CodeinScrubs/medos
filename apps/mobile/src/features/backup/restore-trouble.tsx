import { useState } from 'react';

import { alertError } from '@/components/feedback';
import { Button, Card, Column, Text } from '@/components/ui';
import { useSetting } from '@/db/use-setting';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { recoverInterruptedRestore } from './engine';
import { restoreMediaUnresolved } from './settings';

/**
 * A restore that could not put every file back.
 *
 * The app starts anyway — refusing to open would keep the owner away from the
 * records that are intact — but the database and the files on disk disagree
 * until this is cleared, so it says so on the first screen and offers the one
 * action that can fix it. Automatic backup stays off in the meantime
 * (`runAutoBackupIfDue`), because copying this state elsewhere spreads it.
 */
export function RestoreTrouble() {
  const { spacing, colors } = useTheme();
  const unresolved = useSetting(restoreMediaUnresolved).value;
  const [busy, setBusy] = useState(false);

  if (unresolved <= 0) return null;

  async function tryAgain() {
    setBusy(true);
    try {
      await recoverInterruptedRestore();
    } catch (e) {
      alertError('برگرداندن فایل‌ها نشد', e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ marginTop: spacing.lg, borderColor: colors.danger, borderWidth: 1 }}>
      <Column gap="sm">
        <Text variant="subheading" style={{ color: colors.danger }}>
          یک بازگردانی ناتمام مانده
        </Text>
        <Text variant="caption" color="textMuted">
          {toPersianDigits(unresolved)} فایل سر جای خودش برنگشت، پس ممکن است عکس یا وویسِ بعضی پرونده‌ها مال اطلاعات
          دیگری باشد. تا وقتی این درست نشده، بکاپ خودکار هم گرفته نمی‌شود.
        </Text>
        <Button label="تلاش دوباره" icon="refresh" onPress={() => void tryAgain()} loading={busy} />
      </Column>
    </Card>
  );
}
