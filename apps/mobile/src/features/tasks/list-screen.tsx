import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { ErrorNotice } from '@/components/error-notice';
import { ScreenOptions } from '@/components/screen-options';
import { Button, ChipSelect, Column, EmptyState, Input, Screen, SectionHeader } from '@/components/ui';
import { useNow } from '@/components/use-now';
import type { Task } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { endOfDay } from '@/lib/time';
import { useTheme } from '@/theme';

import { taskCountQuery, tasksQuery, type TaskFilter } from './queries';
import { TaskRow } from './task-row';

export function TaskListScreen() {
  const { patientId, scope } = useLocalSearchParams<{ patientId?: string; scope?: string }>();
  return (
    <TaskList
      key={JSON.stringify([patientId ?? null, scope ?? null])}
      patientId={patientId ?? (scope === 'global' ? null : undefined)}
      dueOnly={scope === 'due'}
    />
  );
}

function TaskList({
  patientId: initialPatientId,
  dueOnly: initialDueOnly,
}: {
  patientId: string | null | undefined;
  dueOnly: boolean;
}) {
  const { spacing } = useTheme();
  const [patientId, setPatientId] = useState(initialPatientId);
  const [dueOnly, setDueOnly] = useState(initialDueOnly);
  const [status, setStatus] = useState<Task['status'] | 'deleted'>('open');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(50);
  const until = endOfDay(new Date(useNow()));
  const filter: TaskFilter = {
    patientId,
    search,
    ...(status === 'deleted' ? { deleted: true } : { status }),
    ...(dueOnly ? { patientDueBy: until } : {}),
  };
  const resultKey = JSON.stringify([
    patientId === undefined ? ['all'] : patientId === null ? ['global'] : ['patient', patientId],
    search,
    status,
    dueOnly ? until.getTime() : null,
    limit,
  ]);
  return (
    <Screen scroll>
      <ScreenOptions
        options={{ title: dueOnly ? 'کارهای موعددار بیماران' : patientId === null ? 'کارهای بدون بیمار' : 'کارها' }}
      />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {!initialPatientId ? (
          <ChipSelect
            value={dueOnly ? 'due' : patientId === null ? 'global' : 'all'}
            options={[
              { value: 'global', label: 'بدون بیمار' },
              { value: 'all', label: 'همهٔ کارها' },
              { value: 'due', label: 'موعددار بیماران' },
            ]}
            onChange={(value) => {
              if (value) {
                setPatientId(value === 'global' ? null : undefined);
                setDueOnly(value === 'due');
                setLimit(50);
              }
            }}
          />
        ) : null}
        <Input
          placeholder="جستجو در کارها"
          value={search}
          onChangeText={(text) => {
            setSearch(text);
            setLimit(50);
          }}
        />
        <ChipSelect
          value={status}
          options={[
            { value: 'open', label: 'باز' },
            { value: 'done', label: 'انجام‌شده' },
            { value: 'cancelled', label: 'لغوشده' },
            { value: 'deleted', label: 'حذف‌شده' },
          ]}
          onChange={(value) => {
            if (value) {
              setStatus(value);
              setLimit(50);
            }
          }}
        />
        <TaskResults key={resultKey} filter={filter} limit={limit} onMore={() => setLimit((n) => n + 50)} />
      </Column>
    </Screen>
  );
}

/** A filter change replaces only this read; old checkboxes cannot claim a new scope. */
function TaskResults({ filter, limit, onMore }: { filter: TaskFilter; limit: number; onMore: () => void }) {
  const router = useRouter();
  const { data: rows, error, retry } = useLive(tasksQuery(filter, limit));
  const { data: count, error: countError, retry: retryCount } = useLive(taskCountQuery(filter));
  return (
    <>
      <ErrorNotice
        error={error ?? countError}
        what="کارها"
        onRetry={() => {
          retry();
          retryCount();
        }}
      />
      <SectionHeader title="نتیجه‌ها" count={error || countError ? undefined : count?.[0]?.total} />
      {rows?.map(({ task, patient }) => (
        <TaskRow
          key={task.id}
          task={task}
          patient={patient}
          onOpen={() => router.push({ pathname: '/task', params: { taskId: task.id } })}
        />
      ))}
      {!error && rows?.length === 0 ? <EmptyState icon="checkbox-outline" title="کاری در این فهرست نیست" /> : null}
      {(count?.[0]?.total ?? 0) > (rows?.length ?? 0) ? (
        <Button label="بیشتر" variant="ghost" disabled={!!error || !!countError} onPress={onMore} />
      ) : null}
    </>
  );
}
