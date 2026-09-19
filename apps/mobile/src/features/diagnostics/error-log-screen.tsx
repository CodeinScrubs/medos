import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Badge, Button, Card, Column, Divider, EmptyState, Row, Screen, Text } from '@/components/ui';
import { formatJalaliDateTime } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';
import { clearErrorLog, errorLogUri, readErrorLog, type ErrorEntry } from '@/platform/error-log';
import { useTheme } from '@/theme';

const SOURCE_LABEL: Record<ErrorEntry['source'], string> = {
  boundary: 'صفحه',
  global: 'کل اپ',
  handled: 'کنترل‌شده',
  startup: 'شروع اپ',
};

/**
 * The on-phone error log, newest first, with a way to send it to whoever is
 * fixing the app. Query values are already redacted in the log itself.
 */
export function ErrorLogScreen() {
  const { spacing } = useTheme();
  const [entries, setEntries] = useState(() => readErrorLog().reverse());

  async function share() {
    const uri = errorLogUri();
    if (!uri) return;
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('اشتراک‌گذاری روی این گوشی در دسترس نیست');
      return;
    }
    await Sharing.shareAsync(uri, { mimeType: 'text/plain', dialogTitle: 'ارسال گزارش خطاها' });
  }

  return (
    <Screen scroll>
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <Text variant="caption" color="textMuted">
          خطاهایی که اپ روی همین گوشی ثبت کرده. هیچ‌جا فرستاده نمی‌شوند مگر خودتان بفرستید. مقادیر اطلاعات بیماران در
          گزارش حذف شده‌اند.
        </Text>

        {entries.length === 0 ? (
          <EmptyState icon="checkmark-circle-outline" title="خطایی ثبت نشده" />
        ) : (
          <>
            <Row gap="sm">
              <View style={{ flex: 1 }}>
                <Button label="ارسال گزارش" icon="share-outline" full onPress={() => void share()} />
              </View>
              <Button
                label="پاک کردن"
                variant="ghost"
                onPress={() =>
                  Alert.alert('پاک کردن گزارش خطاها؟', undefined, [
                    { text: 'انصراف', style: 'cancel' },
                    {
                      text: 'پاک کن',
                      style: 'destructive',
                      onPress: () => {
                        clearErrorLog();
                        setEntries([]);
                      },
                    },
                  ])
                }
              />
            </Row>
            <Text variant="tiny" color="textFaint">
              {toPersianDigits(entries.length)} خطا
            </Text>
            <Card padded={false}>
              {entries.map((e, i) => (
                <View key={`${e.at}-${i}`}>
                  {i > 0 && <Divider />}
                  <Column gap="xxs" style={{ padding: spacing.md }}>
                    <Row gap="xs">
                      <Badge label={SOURCE_LABEL[e.source]} tone={e.fatal ? 'danger' : 'warning'} />
                      <Text variant="tiny" color="textFaint">
                        {formatJalaliDateTime(new Date(e.at))}
                      </Text>
                    </Row>
                    <Text variant="caption" ltr selectable numberOfLines={4}>
                      {e.message}
                    </Text>
                  </Column>
                </View>
              ))}
            </Card>
          </>
        )}
      </Column>
    </Screen>
  );
}
