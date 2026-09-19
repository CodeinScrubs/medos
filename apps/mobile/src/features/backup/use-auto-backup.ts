import { useEffect } from 'react';
import { AppState } from 'react-native';

import { markStaleRunsFailed, runAutoBackupIfDue } from './engine';

/**
 * Checks for a due backup when the app starts and each time it returns to the
 * foreground. A few seconds after launch rather than immediately, so the first
 * screen is never competing with a backup for the JS thread.
 */
export function useAutoBackup(): void {
  useEffect(() => {
    const timer = setTimeout(() => {
      void markStaleRunsFailed().then(runAutoBackupIfDue);
    }, 4000);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void runAutoBackupIfDue();
    });

    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);
}
