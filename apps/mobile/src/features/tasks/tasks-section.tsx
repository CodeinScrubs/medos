import { useRouter } from 'expo-router';

import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { Button, Column, SectionHeader, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';

import { taskCountQuery, tasksQuery } from './queries';
import { QuickAddTask } from './quick-add';
import { TaskRow } from './task-row';

/** A short open-task preview; history and editing live in the full list. */
type Props = { patientId: string | null; shiftId?: string | null; title?: string; limit?: number };

export function TasksSection(props: Props) {
  const scope = useAutosaveScope();
  return scope ? (
    <TaskSectionBody {...props} />
  ) : (
    <AutosaveScope>
      <TaskSectionBody {...props} />
    </AutosaveScope>
  );
}

function TaskSectionBody({ patientId, shiftId, title = 'کارها', limit = 20 }: Props) {
  const router = useRouter();
  const scope = useAutosaveScope();
  const { data, error, retry } = useLive(tasksQuery({ patientId, status: 'open' }, limit), [patientId, limit]);
  const {
    data: count,
    error: countError,
    retry: retryCount,
  } = useLive(taskCountQuery({ patientId, status: 'open' }), [patientId]);
  const rows = data?.filter(({ task }) => task.patientId === patientId && task.status === 'open' && !task.deletedAt);

  function navigate(action: () => void) {
    if (scope) void scope.perform(action);
    else action();
  }

  return (
    <>
      <SectionHeader
        title={title}
        count={countError || error ? undefined : count?.[0]?.total}
        action={
          <Button
            label="همه و تاریخچه"
            variant="ghost"
            size="sm"
            onPress={() =>
              navigate(() =>
                router.push({ pathname: '/tasks', params: patientId ? { patientId } : { scope: 'global' } }),
              )
            }
          />
        }
      />
      <Column gap="sm">
        <ErrorNotice
          error={error ?? countError}
          what="کارها"
          onRetry={() => {
            retry();
            retryCount();
          }}
        />
        <QuickAddTask patientId={patientId} shiftId={shiftId ?? null} />
        {rows?.map(({ task, patient }) => (
          <TaskRow
            key={task.id}
            task={task}
            patient={patient}
            showPatient={!patientId}
            onOpen={() => navigate(() => router.push({ pathname: '/task', params: { taskId: task.id } }))}
          />
        ))}
        {!error && !countError && rows?.length === 0 ? (
          <Text variant="tiny" color="textFaint">
            کاری باز نیست.
          </Text>
        ) : null}
      </Column>
    </>
  );
}
