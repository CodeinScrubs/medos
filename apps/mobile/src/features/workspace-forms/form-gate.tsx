import { useState, type ReactNode } from 'react';

import { useDatasetIntent } from '@/components/dataset-intent';
import { EditGate } from '@/components/edit-gate';
import { ErrorNotice } from '@/components/error-notice';
import { Column, Screen, Text } from '@/components/ui';
import { useNow } from '@/components/use-now';
import { useLive } from '@/db/use-live';

import { workspaceFormSeed } from './queries';
import type { FormPort, FormRecord, FormSeed } from './types';

/** Freeze the first editing intent; refresh failures and route reuse never replace typed input. */
export function WorkspaceFormGate<R extends FormRecord, F>({
  port,
  recordId,
  draftId = null,
  children,
}: {
  port: FormPort<R, F>;
  recordId: string | null;
  draftId?: string | null;
  children: (seed: FormSeed<R, F>, notice: ReactNode, unavailable: boolean) => ReactNode;
}) {
  const [intent] = useState(() => ({ kind: port.codec.kind, recordId, draftId }));
  const [seed, setSeed] = useState<FormSeed<R, F> | null>(null);
  const { stale } = useDatasetIntent();
  const now = useNow();
  const switching = recordId !== intent.recordId || draftId !== intent.draftId || port.codec.kind !== intent.kind;
  const { data, error, retry } = useLive(port.query(intent.recordId, intent.draftId), [
    intent.kind,
    intent.recordId,
    intent.draftId,
  ]);
  let contextError: Error | undefined;
  if (!seed && !stale && !switching && data?.[0] && !error) {
    try {
      if (intent.draftId && data[0].draft?.id !== intent.draftId)
        throw new Error('این پیش‌نویس در دسترس نیست؛ نوشتهٔ دیگری جای آن باز نمی‌شود.');
      setSeed(workspaceFormSeed(port, data[0], intent.recordId, new Date(now)));
    } catch (cause) {
      contextError = cause instanceof Error ? cause : new Error('پیش‌نویس قابل خواندن نیست.');
    }
  }
  if (!seed && contextError)
    return (
      <Screen scroll>
        <Column>
          <ErrorNotice error={contextError} what="پیش‌نویس" onRetry={retry} />
          <Text selectable>{data?.[0]?.draft?.body}</Text>
        </Column>
      </Screen>
    );
  const contextUnavailable =
    switching || !!(intent.recordId !== null && data && (!data[0]?.record || data[0].record.deletedAt));
  return (
    <EditGate editing rows={seed ? [seed] : undefined} error={error} onRetry={retry} fenceDataset what="پیش‌نویس">
      {(_, notice) =>
        seed
          ? children(
              seed,
              <>
                {notice}
                {contextUnavailable ? (
                  <Text color="danger">رکورد یا مسیر این فرم تغییر کرده؛ نوشتهٔ قبلی قابل مرور و کپی است.</Text>
                ) : null}
              </>,
              contextUnavailable || !!error,
            )
          : null
      }
    </EditGate>
  );
}
