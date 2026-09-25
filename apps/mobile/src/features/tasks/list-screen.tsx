import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { ErrorNotice } from '@/components/error-notice';
import { ScreenOptions } from '@/components/screen-options';
import { Button, ChipSelect, Column, EmptyState, Input, Screen, SectionHeader } from '@/components/ui';
import type { Task } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { useTheme } from '@/theme';

import { taskCountQuery, tasksQuery, type TaskFilter } from './queries';
import { TaskRow } from './task-row';

export function TaskListScreen() {
  const { patientId, scope } = useLocalSearchParams<{ patientId?: string; scope?: string }>();
  return (
    <TaskList key={patientId ?? scope ?? 'all'} patientId={patientId ?? (scope === 'global' ? null : undefined)} />
  );
}

function TaskList({ patientId: initialPatientId }: { patientId: string | null | undefined }) {
  const router = useRouter();
  const { spacing } = useTheme();
  const [patientId, setPatientId] = useState(initialPatientId);
  const [status, setStatus] = useState<Task['status'] | 'deleted'>('open');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(50);
  const filter: TaskFilter = { patientId, search, ...(status === 'deleted' ? { deleted: true } : { status }) };
  const { data, error } = useLive(tasksQuery(filter, limit), [patientId, search, status, limit]);
  const { data: count, error: countError } = useLive(taskCountQuery(filter), [patientId, search, status]);
  // useLive keeps previous rows while filters change. Never show an old state's checkbox under a new tab.
  const rows = data?.filter(
    ({ task }) =>
      (patientId === undefined || task.patientId === patientId) &&
      (status === 'deleted' ? task.deletedAt != null : !task.deletedAt && task.status === status),
  );
  return (
    <Screen scroll>
      <ScreenOptions options={{ title: patientId === null ? 'کارهای بدون بیمار' : 'کارها' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {!initialPatientId ? (
          <ChipSelect
            value={patientId === null ? 'global' : 'all'}
            options={[
              { value: 'global', label: 'بدون بیمار' },
              { value: 'all', label: 'همهٔ کارها' },
            ]}
            onChange={(value) => {
              if (value) {
                setPatientId(value === 'global' ? null : undefined);
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
        <ErrorNotice error={error ?? countError} what="کارها" />
        <SectionHeader title="نتیجه‌ها" count={count?.[0]?.total} />
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
          <Button label="بیشتر" variant="ghost" onPress={() => setLimit((n) => n + 50)} />
        ) : null}
      </Column>
    </Screen>
  );
}
