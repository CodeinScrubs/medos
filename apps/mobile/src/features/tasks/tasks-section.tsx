import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useAutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, Column, Input, Row, SectionHeader, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';

import { createTask, taskCountQuery, tasksQuery } from './queries';
import { TaskRow } from './task-row';

/** A short open-task preview; history and editing live in the full list. */
export function TasksSection({
  patientId,
  shiftId,
  title = 'کارها',
  limit = 20,
}: {
  patientId: string | null;
  shiftId?: string | null;
  title?: string;
  limit?: number;
}) {
  const router = useRouter();
  const scope = useAutosaveScope();
  const { data, error } = useLive(tasksQuery({ patientId, status: 'open' }, limit), [patientId, limit]);
  const { data: count, error: countError } = useLive(taskCountQuery({ patientId, status: 'open' }), [patientId]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const adding = useRef(false);
  const rows = data?.filter(({ task }) => task.patientId === patientId && task.status === 'open' && !task.deletedAt);

  async function add() {
    const text = draft.trim();
    if (!text || adding.current) return;
    adding.current = true;
    setBusy(true);
    try {
      await createTask({ title: text, patientId, shiftId: shiftId ?? null, source: 'typed' });
      setDraft((current) => (current === draft ? '' : current));
    } catch (e) {
      alertError('اضافه نشد', e);
    } finally {
      adding.current = false;
      setBusy(false);
    }
  }

  function navigate(action: () => void) {
    if (scope) void scope.perform(action);
    else action();
  }

  return (
    <>
      <SectionHeader
        title={title}
        count={count?.[0]?.total}
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
        <ErrorNotice error={error ?? countError} what="کارها" />
        <Row gap="sm">
          <View style={{ flex: 1 }}>
            <Input
              value={draft}
              onChangeText={setDraft}
              editable={!busy}
              placeholder={patientId ? 'کاری برای این بیمار…' : 'مثلاً تماس با رادیولوژی'}
              onSubmitEditing={() => void add()}
              returnKeyType="done"
            />
          </View>
          <Button label="افزودن" icon="add" onPress={() => void add()} loading={busy} />
        </Row>
        {rows?.map(({ task, patient }) => (
          <TaskRow
            key={task.id}
            task={task}
            patient={patient}
            showPatient={!patientId}
            onOpen={() => navigate(() => router.push({ pathname: '/task', params: { taskId: task.id } }))}
          />
        ))}
        {!error && rows?.length === 0 ? (
          <Text variant="tiny" color="textFaint">
            کاری باز نیست.
          </Text>
        ) : null}
      </Column>
    </>
  );
}
