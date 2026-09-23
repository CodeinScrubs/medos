import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Column, Text } from '@/components/ui';
import { redactErrorText } from '@/lib/redact';
import { logError } from '@/platform/error-log';
import { useTheme } from '@/theme';

/**
 * Shown in place of a screen that threw while rendering. The rest of the app
 * keeps working, the error is written to the on-phone log, and "try again"
 * re-renders the screen — often enough after a transient problem.
 */
export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { colors, spacing, radii } = useTheme();

  useEffect(() => {
    logError(error, { source: 'boundary' });
  }, [error]);

  const details = redactErrorText(`${error.name}: ${error.message}\n\n${error.stack ?? ''}`);

  return (
    <View style={[styles.flex, { backgroundColor: colors.background, padding: spacing.xl }]}>
      <Column gap="md" style={styles.center}>
        <Ionicons name="bandage-outline" size={44} color={colors.warning} />
        <Text variant="title" align="center">
          این صفحه با مشکل روبه‌رو شد
        </Text>
        <Text variant="body" color="textMuted" align="center">
          اطلاعات شما سالم است. دوباره امتحان کنید؛ اگر تکرار شد، از «بیشتر ← تنظیمات ← گزارش خطاها» گزارش را بفرستید.
        </Text>
        <Button label="تلاش دوباره" icon="refresh" onPress={() => void retry()} />
        <Button
          label="کپی جزئیات خطا"
          icon="copy-outline"
          variant="ghost"
          onPress={() => void Clipboard.setStringAsync(details)}
        />
      </Column>
      <ScrollView
        style={{ maxHeight: 180, marginTop: spacing.lg, borderRadius: radii.md, backgroundColor: colors.surfaceAlt }}
        contentContainerStyle={{ padding: spacing.md }}
      >
        <Text variant="tiny" color="textFaint" ltr selectable>
          {details}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'center' },
  center: { alignItems: 'center' },
});
