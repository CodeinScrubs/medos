import { useRouter } from 'expo-router';

import { ErrorNotice } from '@/components/error-notice';
import { Button, Column, SectionHeader } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { endOfDay } from '@/lib/time';

import { duePatientTaskCountQuery, duePatientTasksQuery } from './queries';
import { TaskRow } from './task-row';

/** A bounded preview of due patient work, with the exact matching total and full-list link. */
export function DueTasksSection({ now }: { now: Date }) {
  const router = useRouter();
  const until = endOfDay(now);
  const { data, error, retry } = useLive(duePatientTasksQuery(until, 10), [until.getTime()]);
  const {
    data: count,
    error: countError,
    retry: retryCount,
  } = useLive(duePatientTaskCountQuery(until), [until.getTime()]);
  if (!error && !countError && data !== undefined && data.length === 0) return null;
  return (
    <>
      <SectionHeader
        title="کارهای موعددار بیماران"
        count={error || countError ? undefined : count?.[0]?.total}
        action={
          <Button
            label="همه"
            variant="ghost"
            size="sm"
            onPress={() => router.push({ pathname: '/tasks', params: { scope: 'due' } })}
          />
        }
      />
      <Column gap="sm">
        <ErrorNotice
          error={error ?? countError}
          what="کارهای موعددار"
          onRetry={() => {
            retry();
            retryCount();
          }}
        />
        {data?.map(({ task, patient }) => (
          <TaskRow
            key={task.id}
            task={task}
            patient={patient}
            onOpen={() => router.push({ pathname: '/task', params: { taskId: task.id } })}
          />
        ))}
      </Column>
    </>
  );
}
