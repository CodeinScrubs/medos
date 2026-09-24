import { useEffect } from 'react';
import { AppState } from 'react-native';

import { rescheduleOccasionReminders } from '@/features/doctors/occasions-queries';
import { repairFollowUpReminders } from '@/features/followups/reminder-queries';
import { repairTaskReminders } from '@/features/tasks/reminder-queries';
import { logError } from '@/platform/error-log';

/**
 * Re-arms the recurring reminders on every app start.
 *
 * A birthday reminder is scheduled for one date. Once it has fired, the row
 * still points at a notification id the OS has already used, and next year's
 * greeting would never be raised. Rescheduling from the rows is cheap — a
 * personal directory holds a handful of occasions — and it is also what
 * repairs reminders a phone dropped after a reboot or an OS update.
 *
 * A few seconds after launch, so the first screen is not competing with it.
 */
export function useReminderUpkeep(): void {
  useEffect(() => {
    let running = false;
    const repair = () => {
      if (running) return;
      running = true;
      void Promise.allSettled([repairFollowUpReminders(), repairTaskReminders()])
        .then((results) => {
          for (const result of results)
            if (result.status === 'rejected')
              logError(result.reason, { source: 'handled', context: 'reminder upkeep' });
        })
        .finally(() => {
          running = false;
        });
    };
    const timer = setTimeout(() => {
      repair();
      void rescheduleOccasionReminders().catch((e: unknown) =>
        logError(e, { source: 'handled', context: 'reminder upkeep' }),
      );
    }, 6000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') repair();
    });
    return () => {
      clearTimeout(timer);
      listener.remove();
    };
  }, []);
}
