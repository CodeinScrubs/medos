import { useRef, useState } from 'react';

import { alertError } from '@/components/feedback';
import { Button } from '@/components/ui';
import { useNow } from '@/components/use-now';
import type { Occasion } from '@/db/schema';

import { occasionReminderAt } from './logic';
import { reconcileOccasionReminder } from './occasion-reminder-queries';

/** Only failed/unavailable reminders need extra UI; scheduling is not delivery. */
export function OccasionReminderStatus({ occasion }: { occasion: Occasion }) {
  const now = useNow();
  const busy = useRef(false);
  const [retrying, setRetrying] = useState(false);
  const dirty = occasion.reminderRevision !== occasion.reminderAppliedRevision;
  const unavailable = !!occasionReminderAt(occasion, new Date(now)) && !occasion.notificationId;
  if (!dirty && !unavailable) return null;

  async function retry() {
    if (busy.current) return;
    busy.current = true;
    setRetrying(true);
    try {
      await reconcileOccasionReminder(occasion.id, true);
    } catch (error) {
      alertError('هماهنگی اعلان انجام نشد', error);
    } finally {
      busy.current = false;
      setRetrying(false);
    }
  }
  return (
    <Button
      label="هماهنگی اعلان؛ تلاش مجدد"
      size="sm"
      variant="ghost"
      loading={retrying}
      onPress={() => void retry()}
    />
  );
}
