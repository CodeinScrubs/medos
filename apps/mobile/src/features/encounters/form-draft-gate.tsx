import { Fragment, useState, type ReactNode } from 'react';

import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { Column, Screen, Text } from '@/components/ui';
import { useNow } from '@/components/use-now';
import { useLive } from '@/db/use-live';
import { assertDatasetWrite } from '@/lib/dataset-write';

import type { EncounterFormMode } from './form-draft';
import {
  encounterFormBasis,
  encounterFormQuery,
  encounterFormSeed,
  type EncounterFormSeed,
} from './form-draft-queries';

/** Keep loaded raw input mounted during a later read or target failure. */
export function EncounterFormDraftGate({
  mode,
  patientId,
  encounterId,
  children,
}: {
  mode: EncounterFormMode;
  patientId: string;
  encounterId: string | null;
  children: (
    seed: EncounterFormSeed,
    notice: ReactNode,
    reset: (seed: EncounterFormSeed) => void,
    generation: number,
  ) => ReactNode;
}) {
  const { generation, stale } = useDatasetIntent();
  const { data, error, retry } = useLive(encounterFormQuery(mode, patientId, encounterId), [
    mode,
    patientId,
    encounterId,
  ]);
  const now = useNow();
  const [seed, setSeed] = useState<{ value: EncounterFormSeed; generation: number } | null>(null);
  let contextError: Error | undefined;
  if (!stale && data) {
    try {
      encounterFormBasis(data, mode);
      if (!seed) setSeed({ value: encounterFormSeed(data, mode, encounterId, new Date(now)), generation: 0 });
    } catch (cause) {
      contextError = cause instanceof Error ? cause : new Error('پیش‌نویس قابل خواندن نیست.');
    }
  }
  const notice = stale ? (
    <Text color="danger">اطلاعات از بکاپ جایگزین شد؛ نوشته‌های قبلی را مرور یا کپی کنید.</Text>
  ) : (
    <ErrorNotice error={error ?? contextError} what="پیش‌نویس نوبت" onRetry={retry} />
  );
  if (!seed)
    return (
      <Screen>
        <Column>
          {notice}
          {!stale && !error && !contextError ? <Text>بارگذاری پیش‌نویس…</Text> : null}
        </Column>
      </Screen>
    );
  return (
    <Fragment key={seed.generation}>
      {children(
        seed.value,
        notice,
        (value) => {
          assertDatasetWrite(generation);
          setSeed({ value, generation: seed.generation + 1 });
        },
        generation,
      )}
    </Fragment>
  );
}
