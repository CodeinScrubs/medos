import { useEffect } from 'react';
import { AppState } from 'react-native';

import { logError } from '@/platform/error-log';

import { markStaleRunsFailed, runAutoBackupIfDue } from './engine';

/**
 * Checks for a due backup when the app starts and each time it returns to the
 * foreground. A few seconds after launch rather than immediately, so the first
 * screen is never competing with a backup for the JS thread.
 */
export function useAutoBackup(): void {
  useEffect(() => {
    const report = (error: unknown) => logError(error, { source: 'handled', context: 'checking automatic backup' });
    const timer = setTimeout(() => {
      void markStaleRunsFailed().catch(report).then(runAutoBackupIfDue).catch(report);
    }, 4000);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void runAutoBackupIfDue().catch(report);
    });

    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);
}
