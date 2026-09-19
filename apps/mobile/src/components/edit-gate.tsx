import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';

import { Button, EmptyState, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * The front half of every "new or edit" form screen.
 *
 * When editing, it waits for the record, then renders the form with it; the
 * form initialises its state from that record once. The alternative — render
 * an empty form and copy the record in with an effect when it arrives — shows
 * a blank form for a moment, and can overwrite what the user has started
 * typing if the record changes underneath.
 *
 * A record that no longer exists (deleted on another screen) shows a message,
 * never an empty form that would save as a new record.
 */
export function EditGate<T>({
  editing,
  rows,
  children,
}: {
  /** False for "new": the form renders at once, with no record. */
  editing: boolean;
  /** The live query result; undefined while loading. */
  rows: T[] | undefined;
  children: (record: T | null) => ReactNode;
}) {
  const { colors, spacing } = useTheme();
  const router = useRouter();

  if (!editing) return <>{children(null)}</>;
  if (!rows) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.huge }} />
      </Screen>
    );
  }
  const record = rows[0];
  if (!record) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title="پیدا نشد"
          description="ممکن است حذف شده باشد."
          action={<Button label="بازگشت" variant="ghost" onPress={() => router.back()} />}
        />
      </Screen>
    );
  }
  return <>{children(record)}</>;
}
