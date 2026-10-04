import { useState, useSyncExternalStore } from 'react';

import { datasetGeneration, subscribeDataset } from '@/lib/dataset-write';

import { useAutosaveScope } from './autosave-scope';

/** Late children inherit the screen's original intent; never rebase implicitly. */
export function useDatasetIntent(expected?: number) {
  const scope = useAutosaveScope();
  const [generation] = useState(() => expected ?? scope?.generation ?? datasetGeneration());
  const current = useSyncExternalStore(subscribeDataset, datasetGeneration, datasetGeneration);
  return { generation, stale: generation !== current };
}
