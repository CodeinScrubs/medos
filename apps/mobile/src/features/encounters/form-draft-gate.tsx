import { Fragment, useState, type ReactNode } from 'react';

import { ErrorNotice } from '@/components/error-notice';
import { Column, Screen, Text } from '@/components/ui';
import { useNow } from '@/components/use-now';
import { useLive } from '@/db/use-live';

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
  children: (seed: EncounterFormSeed, notice: ReactNode, reset: (seed: EncounterFormSeed) => void) => ReactNode;
}) {
  const { data, error, retry } = useLive(encounterFormQuery(mode, patientId, encounterId), [
    mode,
    patientId,
    encounterId,
  ]);
  const now = useNow();
  const [seed, setSeed] = useState<{ value: EncounterFormSeed; generation: number } | null>(null);
  let contextError: Error | undefined;
  if (data) {
    try {
      encounterFormBasis(data, mode);
      if (!seed) setSeed({ value: encounterFormSeed(data, mode, encounterId, new Date(now)), generation: 0 });
    } catch (cause) {
      contextError = cause instanceof Error ? cause : new Error('پیش‌نویس قابل خواندن نیست.');
    }
  }
  const notice = <ErrorNotice error={error ?? contextError} what="پیش‌نویس نوبت" onRetry={retry} />;
  if (!seed)
    return (
      <Screen>
        <Column>
          {notice}
          {!error && !contextError ? <Text>بارگذاری پیش‌نویس…</Text> : null}
        </Column>
      </Screen>
    );
  return (
    <Fragment key={seed.generation}>
      {children(seed.value, notice, (value) => setSeed({ value, generation: seed.generation + 1 }))}
    </Fragment>
  );
}
