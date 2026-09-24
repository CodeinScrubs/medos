import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { AutosaveField } from '@/components/autosave-field';
import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { EditGate } from '@/components/edit-gate';
import { ErrorNotice } from '@/components/error-notice';
import { Badge, Button, ChipSelect, Column, Row, Screen, Text } from '@/components/ui';
import type { Task } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { patientQuery } from '@/features/patients/queries';
import { formatJalaliDateTime } from '@/lib/jalali';
import { fullName } from '@/lib/persian';
import { useTheme } from '@/theme';

import { TASK_PRIORITY_OPTIONS, TASK_STATUS_LABEL } from './labels';
import { deleteTask, restoreTask, setTaskStatus, taskQuery, updateTask } from './queries';
import { TaskSchedule } from './schedule-editor';

export function TaskScreen() {
  const { taskId = '' } = useLocalSearchParams<{ taskId?: string }>();
  return <TaskGate key={taskId} id={taskId} />;
}

function TaskGate({ id }: { id: string }) {
  const { data, error } = useLive(taskQuery(id, true), [id]);
  if (error && data === undefined)
    return (
      <Screen>
        <ErrorNotice error={error} what="کار" />
      </Screen>
    );
  return (
    <EditGate editing rows={data}>
      {(task) =>
        task ? (
          <AutosaveScope key={`${task.id}:${!!task.deletedAt}`}>
            <TaskDetail task={task} readError={error} />
          </AutosaveScope>
        ) : null
      }
    </EditGate>
  );
}

function TaskDetail({ task, readError }: { task: Task; readError?: Error }) {
  const scope = useAutosaveScope()!;
  const router = useRouter();
  const { spacing } = useTheme();
  const { data: patients, error } = useLive(patientQuery(task.patientId ?? ''), [task.patientId]);
  const patient = patients?.[0];
  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'کار' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <ErrorNotice error={readError} what="کار" />
        <ErrorNotice error={error} what="بیمار" />
        {patient ? (
          <Button
            label={fullName(patient.firstName, patient.lastName)}
            variant="ghost"
            onPress={() =>
              void scope.perform(() => router.push({ pathname: '/patient/[id]', params: { id: patient.id } }))
            }
          />
        ) : !task.patientId || patients !== undefined ? (
          <Text variant="caption">{task.patientId ? 'بیمار حذف‌شده' : 'بدون بیمار'}</Text>
        ) : null}
        <Badge label={task.deletedAt ? 'حذف‌شده' : TASK_STATUS_LABEL[task.status]} />
        {task.deletedAt ? (
          <>
            <Text variant="heading">{task.title}</Text>
            {task.notes ? <Text selectable>{task.notes}</Text> : null}
            {task.outcome ? <Text selectable>{task.outcome}</Text> : null}
            <Button label="بازگرداندن کار" onPress={() => void scope.perform(() => restoreTask(task.id))} />
          </>
        ) : (
          <>
            <AutosaveField label="عنوان" initialValue={task.title} onSave={(title) => updateTask(task.id, { title })} />
            <AutosaveField
              label="یادداشت"
              multiline
              initialValue={task.notes}
              onSave={(notes) => updateTask(task.id, { notes })}
            />
            <ChipSelect
              label="اولویت"
              value={task.priority}
              options={TASK_PRIORITY_OPTIONS}
              onChange={(priority) => {
                if (priority) void scope.perform(() => updateTask(task.id, { priority }));
              }}
            />
            <TaskSchedule task={task} />
            <AutosaveField
              label="نتیجه"
              multiline
              initialValue={task.outcome}
              onSave={(outcome) => updateTask(task.id, { outcome })}
            />
            {task.completedAt ? (
              <Text variant="caption">
                {TASK_STATUS_LABEL[task.status]}: {formatJalaliDateTime(task.completedAt)}
              </Text>
            ) : null}
            <Row gap="sm" wrap>
              {task.status === 'open' ? (
                <>
                  <Button label="انجام شد" onPress={() => void scope.perform(() => setTaskStatus(task.id, 'done'))} />
                  <Button
                    label="لغو کار"
                    variant="ghost"
                    onPress={() => void scope.perform(() => setTaskStatus(task.id, 'cancelled'))}
                  />
                </>
              ) : (
                <Button label="بازگشایی کار" onPress={() => void scope.perform(() => setTaskStatus(task.id, 'open'))} />
              )}
              <Button
                label="حذف"
                variant="ghost"
                onPress={() =>
                  Alert.alert('حذف این کار؟', 'از فهرست حذف‌شده‌ها قابل بازگرداندن است.', [
                    { text: 'انصراف', style: 'cancel' },
                    { text: 'حذف', style: 'destructive', onPress: () => void scope.perform(() => deleteTask(task.id)) },
                  ])
                }
              />
            </Row>
          </>
        )}
      </Column>
    </Screen>
  );
}
