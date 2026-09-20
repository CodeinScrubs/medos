import { useEffect } from 'react';

import { rescheduleOccasionReminders } from '@/features/doctors/occasions-queries';
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
    const timer = setTimeout(() => {
      void rescheduleOccasionReminders().catch((e: unknown) =>
        logError(e, { source: 'handled', context: 'reminder upkeep' }),
      );
    }, 6000);
    return () => clearTimeout(timer);
  }, []);
}
