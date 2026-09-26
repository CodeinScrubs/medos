import { useRouter } from 'expo-router';

import { Button, Card, Column, Text } from '@/components/ui';
import { useSetting } from '@/db/use-setting';
import { useTheme } from '@/theme';

import { backupFreshness } from './logic';
import { backupLastSuccessAt } from './settings';

/**
 * On Today when there is no backup, or the newest is days old.
 *
 * The backup screen already said so, but only to someone who went looking
 * under «بیشتر»; an hour of records could go in with nothing outside the
 * phone and nothing on the first screen to mention it. Silent once a recent
 * backup exists.
 */
export function BackupNudge({ now }: { now: number }) {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const last = useSetting(backupLastSuccessAt);
  if (!last.loaded) return null;
  const freshness = backupFreshness(last.value, now);
  if (freshness === 'fresh') return null;

  const never = freshness === 'never';
  return (
    <Card
      style={{
        marginTop: spacing.lg,
        borderColor: never ? colors.danger : colors.warning,
        borderWidth: 1,
      }}
    >
      <Column gap="sm">
        <Text variant="subheading" color={never ? 'danger' : 'warning'}>
          {never ? 'هنوز بکاپی گرفته نشده' : 'آخرین بکاپ چند روز پیش است'}
        </Text>
        <Text variant="caption" color="textMuted">
          {never
            ? 'همه‌ی این اطلاعات فقط روی همین گوشی است. یک رمز و یک پوشه تعیین کنید تا بکاپ خودکار شروع شود.'
            : 'بکاپ خودکار فقط وقتی اپ باز می‌شود اجرا می‌شود؛ یک بکاپ کامل همین حالا بگیرید.'}
        </Text>
        <Button
          label="رفتن به پشتیبان‌گیری"
          icon="cloud-upload-outline"
          variant="secondary"
          size="sm"
          onPress={() => router.push('/backup')}
        />
      </Column>
    </Card>
  );
}
