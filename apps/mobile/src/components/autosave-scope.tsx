import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import { assertDatasetWrite, datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { SaveGroup } from '@/lib/save-before-leave';

import { alertError, notify } from './feedback';
import { useSaveBeforeLeave } from './use-save-before-leave';

type Scope = {
  group: SaveGroup;
  perform(action: () => void | Promise<void>): Promise<void>;
  abandonStale(): void;
  canLeave(): Promise<boolean>;
  isAbandoned(): boolean;
};
const Context = createContext<Scope | null>(null);

/** One exit check for the whole screen, rather than competing guards on individual fields. */
export function AutosaveScope({ children }: PropsWithChildren) {
  const [scope] = useState<Scope>(() => {
    const group = new SaveGroup();
    const generation = datasetGeneration();
    let abandoned = false;
    return {
      group,
      abandonStale() {
        if (generation === datasetGeneration()) throw new Error('A current intent must be saved before leaving.');
        abandoned = true;
      },
      isAbandoned() {
        return abandoned;
      },
      async canLeave() {
        if (abandoned) return true;
        assertDatasetWrite(generation);
        const saved = await group.flush();
        assertDatasetWrite(generation);
        return saved;
      },
      async perform(action) {
        try {
          assertDatasetWrite(generation);
          if (
            (await group.perform(() => {
              assertDatasetWrite(generation);
              return withDatasetWrite(generation, async () => {
                await action();
              });
            })) === 'unsaved'
          ) {
            notify('هنوز ذخیره نشد', 'نوشته روی صفحه باقی مانده است. دوباره تلاش کنید.');
          }
        } catch (e) {
          alertError('انجام نشد', e);
        }
      },
    };
  });
  // Checking an already-clean group resolves immediately, with no prompt.
  useSaveBeforeLeave(scope.canLeave, scope.isAbandoned);
  return <Context.Provider value={scope}>{children}</Context.Provider>;
}

export function useAutosaveScope() {
  return useContext(Context);
}
