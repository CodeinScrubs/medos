import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import type { ErrorBoundaryProps } from 'expo-router';
import { NavigationContext } from 'expo-router/react-navigation';
import { useContext, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { alertError } from '@/components/feedback';
import { Button, Column, Text } from '@/components/ui';
import { diagnosticText, errorDiagnostic, safeErrorMessage } from '@/lib/error-diagnostic';
import { logError } from '@/platform/error-log';
import { useTheme } from '@/theme';

/**
 * Shown in place of a screen that threw while rendering. The rest of the app
 * keeps working, the error is written to the on-phone log, and "try again"
 * re-renders the screen — often enough after a transient problem.
 */
export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { colors, spacing, radii } = useTheme();
  const navigation = useContext(NavigationContext);
  const mounted = useRef(false);
  const lifetime = useRef(0);
  const action = useRef<symbol | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    mounted.current = true;
    const mountedLifetime = lifetime.current + 1;
    lifetime.current = mountedLifetime;
    return () => {
      mounted.current = false;
      lifetime.current = mountedLifetime + 1;
      action.current = null;
    };
  }, []);

  useEffect(() => {
    logError(error, { source: 'boundary' });
  }, [error]);

  const details = `${safeErrorMessage(error)}\n\n${diagnosticText(errorDiagnostic(error))}`;
  async function perform(copy: boolean): Promise<void> {
    if (!mounted.current || (navigation && !navigation.isFocused()) || action.current) return;
    const token = Symbol();
    const originalLifetime = lifetime.current;
    action.current = token;
    setBusy(true);
    try {
      if (copy) {
        if ((await Clipboard.setStringAsync(details)) !== true)
          throw new Error('کپی جزئیات خطا تأیید نشد؛ دوباره تلاش کنید.');
      } else await retry();
    } catch (failure) {
      if (mounted.current && originalLifetime === lifetime.current && (!navigation || navigation.isFocused()))
        alertError(copy ? 'کپی جزئیات انجام نشد' : 'تلاش دوباره کامل نشد', failure);
      else logError(failure, { source: 'handled', context: 'diagnostics.clipboard' });
    } finally {
      if (action.current === token && originalLifetime === lifetime.current) {
        action.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background, padding: spacing.xl }]}>
      <Column gap="md" style={styles.center}>
        <Ionicons name="bandage-outline" size={44} color={colors.warning} />
        <Text variant="title" align="center">
          این صفحه با مشکل روبه‌رو شد
        </Text>
        <Text variant="body" color="textMuted" align="center">
          دوباره امتحان کنید؛ اگر تکرار شد، از «بیشتر ← تنظیمات ← گزارش خطاها» گزارش را بفرستید.
        </Text>
        <Button label="تلاش دوباره" icon="refresh" disabled={busy} onPress={() => void perform(false)} />
        <Button
          label="کپی جزئیات خطا"
          icon="copy-outline"
          variant="ghost"
          disabled={busy}
          onPress={() => void perform(true)}
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
