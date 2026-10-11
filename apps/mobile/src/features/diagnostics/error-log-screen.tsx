import { useNavigation } from 'expo-router/react-navigation';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError, notify } from '@/components/feedback';
import { Badge, Button, Card, Column, Divider, EmptyState, Row, Screen, Text } from '@/components/ui';
import { diagnosticText } from '@/lib/error-diagnostic';
import { formatJalaliDateTime } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';
import {
  clearErrorLog,
  logError,
  prepareErrorLogShare,
  readErrorLog,
  retainErrorLogShare,
  type ErrorEntry,
  type ErrorLogSnapshot,
} from '@/platform/error-log';
import { useTheme } from '@/theme';

const SOURCE_LABEL: Record<ErrorEntry['source'], string> = {
  boundary: 'صفحه',
  global: 'کل اپ',
  handled: 'کنترل‌شده',
  startup: 'شروع اپ',
};
type ViewState = { snapshot?: ErrorLogSnapshot; error?: Error };
function currentRead(previous: ViewState = {}): ViewState {
  const read = readErrorLog();
  return read.status === 'ok' ? { snapshot: read.snapshot } : { snapshot: previous.snapshot, error: read.error };
}

export function ErrorLogScreen() {
  const navigation = useNavigation();
  const { spacing } = useTheme();
  const [view, setView] = useState<ViewState>(() => currentRead());
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const lifetime = useRef(0);
  const action = useRef<symbol | null>(null);
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
  function focused() {
    return mounted.current && navigation.isFocused();
  }
  function begin(): { token: symbol; lifetime: number } | undefined {
    if (!focused() || action.current) return undefined;
    const token = Symbol();
    action.current = token;
    setBusy(true);
    return { token, lifetime: lifetime.current };
  }
  function owns(owner: { token: symbol; lifetime: number }) {
    return focused() && action.current === owner.token && lifetime.current === owner.lifetime;
  }
  function finish(owner: { token: symbol; lifetime: number }) {
    if (action.current !== owner.token || lifetime.current !== owner.lifetime) return;
    action.current = null;
    if (mounted.current) setBusy(false);
  }
  function report(
    title: string,
    error: unknown,
    context: 'diagnostics.share' | 'diagnostics.clear',
    owner: { token: symbol; lifetime: number },
  ) {
    if (owns(owner)) {
      alertError(title, error);
      setView((previous) => currentRead(previous));
    } else logError(error, { source: 'handled', context });
  }
  function refresh() {
    if (!focused() || action.current) return;
    setView((previous) => currentRead(previous));
  }
  async function share(): Promise<void> {
    const owner = begin();
    if (!owner) return;
    let release: (() => void) | undefined;
    try {
      const available = await Sharing.isAvailableAsync();
      if (!owns(owner)) return;
      if (!available) {
        notify('اشتراک‌گذاری روی این گوشی در دسترس نیست');
        return;
      }
      const read = readErrorLog();
      if (read.status === 'error') throw read.error;
      setView({ snapshot: read.snapshot });
      if (!read.snapshot.entries.length && !read.snapshot.incomplete) {
        notify('گزارشی برای ارسال نیست');
        return;
      }
      const uri = prepareErrorLogShare(read.snapshot);
      if (!owns(owner)) return;
      release = retainErrorLogShare(uri);
      await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'ارسال گزارش خطاها' });
      // Chooser cancellation and selection both resolve. Neither proves delivery.
    } catch (error) {
      report('ارسال گزارش کامل نشد', error, 'diagnostics.share', owner);
    } finally {
      release?.();
      finish(owner);
    }
  }
  function confirmClear() {
    const owner = begin();
    if (!owner) return;
    const consume = (accepted: boolean) => {
      if (!owns(owner)) {
        finish(owner);
        return;
      }
      if (!accepted) {
        finish(owner);
        return;
      }
      try {
        clearErrorLog();
        setView({
          snapshot: {
            entries: [],
            incomplete: false,
            legacyConverted: 0,
            skippedInWindow: 0,
            earlierBytesOmitted: false,
            writeFailureObserved: false,
          },
        });
      } catch (error) {
        report('پاک کردن گزارش انجام نشد', error, 'diagnostics.clear', owner);
      } finally {
        finish(owner);
      }
    };
    try {
      Alert.alert(
        'پاک کردن گزارش خطاها؟',
        undefined,
        [
          { text: 'انصراف', style: 'cancel', onPress: () => consume(false) },
          { text: 'پاک کن', style: 'destructive', onPress: () => consume(true) },
        ],
        { cancelable: true, onDismiss: () => consume(false) },
      );
    } catch (error) {
      report('پاک کردن گزارش انجام نشد', error, 'diagnostics.clear', owner);
      finish(owner);
    }
  }
  const entries = view.snapshot?.entries.slice().reverse() ?? [];
  return (
    <Screen scroll>
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <Text variant="caption" color="textMuted">
          فقط اطلاعات فنی خطاها روی همین گوشی نگه داشته می‌شود. ارسال گزارش فقط با انتخاب شماست.
        </Text>
        <ErrorNotice error={view.error} what="گزارش خطاها" onRetry={refresh} />
        {view.snapshot?.incomplete ? (
          <Text variant="caption" color="textMuted">
            بخشی از گزارش قدیمی یا ناتمام قابل خواندن نیست؛ این گزارش تاریخچهٔ کامل استفاده نیست.
          </Text>
        ) : null}
        {entries.length || view.error || view.snapshot?.incomplete ? (
          <Row gap="sm">
            <View style={{ flex: 1 }}>
              <Button
                label="ارسال گزارش"
                icon="share-outline"
                full
                disabled={busy || !!view.error}
                onPress={() => void share()}
              />
            </View>
            <Button label="پاک کردن" variant="ghost" disabled={busy} onPress={confirmClear} />
          </Row>
        ) : null}
        {!entries.length && !view.error && !view.snapshot?.incomplete ? (
          <EmptyState icon="checkmark-circle-outline" title="خطایی ثبت نشده" />
        ) : null}
        {entries.length ? (
          <>
            <Text variant="tiny" color="textFaint">
              {toPersianDigits(entries.length)} خطا
            </Text>
            <Card padded={false}>
              {entries.map((entry, i) => (
                <View key={`${entry.at}-${i}`}>
                  {i > 0 && <Divider />}
                  <Column gap="xxs" style={{ padding: spacing.md }}>
                    <Row gap="xs">
                      <Badge label={SOURCE_LABEL[entry.source]} tone={entry.fatal ? 'danger' : 'warning'} />
                      <Text variant="tiny" color="textFaint">
                        {formatJalaliDateTime(new Date(entry.at))}
                      </Text>
                    </Row>
                    <Text variant="caption" ltr selectable numberOfLines={4}>
                      {[entry.context, diagnosticText(entry.diagnostic)].filter(Boolean).join('\n')}
                    </Text>
                  </Column>
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </Column>
    </Screen>
  );
}
