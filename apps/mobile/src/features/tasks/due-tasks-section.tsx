import { useRouter } from 'expo-router';

import { ErrorNotice } from '@/components/error-notice';
import { Column, SectionHeader } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { endOfDay } from '@/lib/time';

import { duePatientTasksQuery } from './queries';
import { TaskRow } from './task-row';

/** Patients' tasks due today or overdue, soonest first. Nothing at all when there are none. */
export function DueTasksSection({ now }: { now: Date }) {
  const router = useRouter();
  const until = endOfDay(now);
  const { data, error, retry } = useLive(duePatientTasksQuery(until), [until.getTime()]);
  if (!error && (data === undefined || data.length === 0)) return null;
  return (
    <>
      <SectionHeader title="کارهای موعددار بیماران" count={error ? undefined : data?.length} />
      <Column gap="sm">
        <ErrorNotice error={error} what="کارهای موعددار" onRetry={retry} />
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
