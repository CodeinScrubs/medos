import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { startDatabase } from '@/db/startup';
import { reindexSearchIfNeeded } from '@/features/search/reindex';
import { redactErrorText } from '@/lib/redact';
import { logError } from '@/platform/error-log';
import { useTheme } from '@/theme';

type State = { status: 'starting' } | { status: 'ready' } | { status: 'error'; error: Error };

/**
 * Everything that must finish before the first screen renders, in order:
 *
 * 1. The database: connection settings, a snapshot if an update brought
 *    migrations, the migrations themselves, seeds (`db/startup.ts`).
 * 2. Search indexes rebuilt if the rules that build them changed.
 *
 * A failure is shown, never swallowed. If the schema is not what the code
 * expects, every screen below would fail in a more confusing way, and carrying
 * on risks writing into a half-migrated database.
 */
async function startApp(): Promise<void> {
  await startDatabase();
  await reindexSearchIfNeeded();
}

export function StartupGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'starting' });

  useEffect(() => {
    let cancelled = false;
    startApp().then(
      () => {
        if (!cancelled) setState({ status: 'ready' });
      },
      (e: unknown) => {
        logError(e, { source: 'startup', fatal: true });
        if (!cancelled) setState({ status: 'error', error: e instanceof Error ? e : new Error(String(e)) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'error') return <StartupFailure error={state.error} />;
  if (state.status === 'starting') return <StartupLoading />;
  return <>{children}</>;
}

function StartupLoading() {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

function StartupFailure({ error }: { error: Error }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.xl }]}>
      <Text variant="title" color="danger" align="center">
        پایگاه داده باز نشد
      </Text>
      <Text variant="body" color="textMuted" align="center" style={{ marginTop: spacing.md }}>
        اطلاعات شما پاک نشده است. از این پیام عکس بگیرید و اپ را دوباره باز کنید.
      </Text>
      <Text variant="caption" color="textFaint" ltr selectable style={{ marginTop: spacing.lg }}>
        {redactErrorText(error.message)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
