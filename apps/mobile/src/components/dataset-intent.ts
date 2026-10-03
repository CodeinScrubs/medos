import { useState, useSyncExternalStore } from 'react';

import { datasetGeneration, subscribeDataset } from '@/lib/dataset-write';

/** Keep the original intent while rows/props refresh; never rebase implicitly. */
export function useDatasetIntent(expected?: number) {
  const [generation] = useState(() => expected ?? datasetGeneration());
  const current = useSyncExternalStore(subscribeDataset, datasetGeneration, datasetGeneration);
  return { generation, stale: generation !== current };
}
