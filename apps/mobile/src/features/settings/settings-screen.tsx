import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable } from 'react-native';

import { Card, Column, DataRow, Divider, Row, Screen, SectionHeader, Segmented, Text, Toggle } from '@/components/ui';
import { databaseSizeBytes } from '@/db/files';
import { writeSetting } from '@/db/settings';
import { useSetting } from '@/db/use-setting';
import { keepOriginalsMode, type KeepOriginalsMode } from '@/features/attachments/settings';
import { disableAppLock, enableAppLock } from '@/features/lock/lock-gate';
import { lockEnabled, lockGraceSeconds } from '@/features/lock/settings';
import { formatBytes } from '@/lib/format';
import { toPersianDigits } from '@/lib/persian';
import { mediaFolderSize } from '@/platform/media';
import { useTheme } from '@/theme';

export function SettingsScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const lockOn = useSetting(lockEnabled).value;
  const grace = useSetting(lockGraceSeconds).value;
  const keepOriginals = useSetting(keepOriginalsMode).value;

  // Measured once when the screen opens; both are quick, synchronous reads.
  const [storage] = useState(() => ({ db: databaseSizeBytes(), media: mediaFolderSize() }));

  return (
    <Screen scroll>
      <Column gap="none" style={{ paddingTop: spacing.md }}>
        <SectionHeader title="امنیت" />
        <Card>
          <Column gap="xs">
            <Toggle
              label="قفل اپ"
              description="با اثر انگشت یا قفل صفحه‌ی گوشی باز شود"
              value={lockOn}
              onChange={async (next) => {
                if (next) {
                  const result = await enableAppLock();
                  if (!result.ok && result.reason) Alert.alert('فعال نشد', result.reason);
                } else {
                  await disableAppLock();
                }
              }}
            />
            {lockOn && (
              <>
                <Divider />
                <Segmented
                  label="قفل دوباره بعد از"
                  value={String(grace)}
                  onChange={(v) => void writeSetting(lockGraceSeconds, Number(v))}
                  options={[
                    { value: '30', label: '۳۰ ثانیه' },
                    { value: '60', label: '۱ دقیقه' },
                    { value: '300', label: '۵ دقیقه' },
                  ]}
                />
                <Text variant="tiny" color="textFaint">
                  رفتن به دوربین یا گالری هم اپ را به پس‌زمینه می‌برد؛ برای همین قفل فوری نمی‌شود.
                </Text>
              </>
            )}
          </Column>
        </Card>

        <SectionHeader title="حافظه" />
        <Card>
          <DataRow label="دیتابیس" value={formatBytes(storage.db)} />
          <DataRow label="عکس‌ها و صداها" value={formatBytes(storage.media)} />
          <Divider />
          <Segmented
            label="نگه داشتن اصل عکس‌ها"
            value={keepOriginals}
            onChange={(v) => void writeSetting(keepOriginalsMode, v as KeepOriginalsMode)}
            options={[
              { value: 'clinical', label: 'عکس بالینی' },
              { value: 'always', label: 'همه' },
              { value: 'never', label: 'هیچ' },
            ]}
          />
          <Text variant="tiny" color="textFaint">
            هر عکس برای پرونده به ۲۴۰۰ پیکسل فشرده می‌شود. اصلِ عکس حدود ۸ تا ۱۰ برابر جا می‌گیرد، ولی برای زوم روی
            ضایعه و مقایسه‌ی نوار قلب لازم است. این تنظیم روی عکس‌های قبلی اثری ندارد.
          </Text>
        </Card>

        <SectionHeader title="عیب‌یابی" />
        <Pressable onPress={() => router.push('/diagnostics')} accessibilityRole="button">
          <Card>
            <Row justify="space-between">
              <Column gap="xxs" style={{ flex: 1 }}>
                <Text variant="subheading">گزارش خطاها</Text>
                <Text variant="caption" color="textMuted">
                  برای ارسال به کسی که اپ را درست می‌کند
                </Text>
              </Column>
              <Ionicons name="chevron-back" size={18} color={colors.textFaint} />
            </Row>
          </Card>
        </Pressable>

        <SectionHeader title="درباره" />
        <Card>
          <DataRow label="نسخه" value={toPersianDigits(Constants.expoConfig?.version ?? '—')} />
          <Text variant="tiny" color="textFaint" style={{ marginTop: spacing.xs }}>
            همه‌ی اطلاعات فقط روی همین گوشی و در بکاپ‌های رمزنگاری‌شده‌ی خودتان است.
          </Text>
        </Card>
      </Column>
    </Screen>
  );
}
