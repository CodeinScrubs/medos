import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import { SaveGroup } from '@/lib/save-before-leave';

import { alertError, notify } from './feedback';
import { useSaveBeforeLeave } from './use-save-before-leave';

type Scope = { group: SaveGroup; perform(action: () => void | Promise<void>): Promise<void> };
const Context = createContext<Scope | null>(null);

/** One exit check for the whole screen, rather than competing guards on individual fields. */
export function AutosaveScope({ children }: PropsWithChildren) {
  const [scope] = useState<Scope>(() => {
    const group = new SaveGroup();
    return {
      group,
      async perform(action) {
        try {
          if ((await group.perform(action)) === 'unsaved') {
            notify('هنوز ذخیره نشد', 'نوشته روی صفحه باقی مانده است. دوباره تلاش کنید.');
          }
        } catch (e) {
          alertError('انجام نشد', e);
        }
      },
    };
  });
  // Checking an already-clean group resolves immediately, with no prompt.
  useSaveBeforeLeave(() => scope.group.flush());
  return <Context.Provider value={scope}>{children}</Context.Provider>;
}

export function useAutosaveScope() {
  return useContext(Context);
}
