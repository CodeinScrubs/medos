import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';

import { Button, EmptyState, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { useDatasetIntent } from './dataset-intent';
import { ErrorNotice } from './error-notice';

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
  error,
  onRetry,
  what = 'اطلاعات',
  fenceDataset = false,
  children,
}: {
  /** False for "new": the form renders at once, with no record. */
  editing: boolean;
  /** The live query result; undefined while loading. */
  rows: T[] | undefined;
  error: Error | undefined;
  onRetry: () => void;
  what?: string;
  /** Opt in only when the form's write/publish/discard callbacks carry the token. */
  fenceDataset?: boolean;
  /** Place the notice inside the form's Screen; keep the same form mounted on refresh errors. */
  children: (record: T | null, readNotice: ReactNode, generation: number) => ReactNode;
}) {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { generation, stale } = useDatasetIntent();
  const [retained, setRetained] = useState<T | null | undefined>(() => (editing ? rows?.[0] : null));
  // Remember the form's first seed, not later live refreshes. A conditional
  // state adjustment preserves it without reading/mutating a ref in render.
  if (fenceDataset && !stale && retained === undefined && rows?.[0]) setRetained(rows[0]);

  if (fenceDataset && stale) {
    const notice = (
      <Text color="danger">اطلاعات از بکاپ جایگزین شد؛ این فرم فقط برای مرور و کپی نوشته‌های قبلی است.</Text>
    );
    return retained !== undefined ? <>{children(retained, notice, generation)}</> : <Screen>{notice}</Screen>;
  }

  if (!editing) {
    return <>{children(null, null, generation)}</>;
  }
  const notice = <ErrorNotice error={error} what={what} onRetry={onRetry} />;
  if (error && !rows?.length) return <Screen>{notice}</Screen>;
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
  return <>{children(record, notice, generation)}</>;
}
