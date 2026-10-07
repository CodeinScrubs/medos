import { useRef, useState } from 'react';

import { useDatasetIntent } from '@/components/dataset-intent';
import { alertError } from '@/components/feedback';
import { Button } from '@/components/ui';
import { useNow } from '@/components/use-now';
import type { Occasion } from '@/db/schema';
import { withDatasetWrite } from '@/lib/dataset-write';

import { occasionReminderAt } from './logic';
import { reconcileOccasionReminder } from './occasion-reminder-queries';

/** Only failed/unavailable reminders need extra UI; scheduling is not delivery. */
export function OccasionReminderStatus({
  occasion,
  generation: expected,
  disabled = false,
}: {
  occasion: Occasion;
  generation?: number;
  disabled?: boolean;
}) {
  const { generation, stale } = useDatasetIntent(expected);
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
      await withDatasetWrite(generation, () => reconcileOccasionReminder(occasion.id, true));
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
      disabled={disabled || stale}
      onPress={() => void retry()}
    />
  );
}
