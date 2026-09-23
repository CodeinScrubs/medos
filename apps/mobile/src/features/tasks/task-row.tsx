import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { alertError } from '@/components/feedback';
import { Badge, Card, Column, Row, Text } from '@/components/ui';
import type { Patient, Task } from '@/db/schema';
import { formatJalaliDateTime } from '@/lib/jalali';
import { fullName } from '@/lib/persian';
import { useTheme } from '@/theme';

import { TASK_STATUS_LABEL } from './labels';
import { setTaskStatus } from './queries';

export function TaskRow({
  task,
  patient,
  onOpen,
  showPatient = true,
}: {
  task: Task;
  patient: Patient | null;
  onOpen: () => void;
  showPatient?: boolean;
}) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      await setTaskStatus(task.id, task.status === 'open' ? 'done' : 'open');
    } catch (e) {
      alertError('وضعیت کار تغییر نکرد', e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Row gap="sm" align="flex-start">
        {!task.deletedAt ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: task.status === 'done', disabled: busy }}
            accessibilityLabel={task.status === 'open' ? 'انجام شد' : 'بازگشایی کار'}
            disabled={busy}
            hitSlop={8}
            onPress={() => void toggle()}
          >
            <Ionicons
              name={task.status === 'done' ? 'checkmark-circle' : 'ellipse-outline'}
              size={24}
              color={colors.primary}
            />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" style={{ flex: 1 }} onPress={onOpen}>
          <Column gap="xxs">
            <Text numberOfLines={2}>{task.title}</Text>
            <Row gap="xs" wrap>
              {showPatient && patient ? (
                <Badge label={fullName(patient.firstName, patient.lastName)} />
              ) : showPatient && task.patientId ? (
                <Badge label="بیمار حذف‌شده" />
              ) : null}
              {task.status !== 'open' ? <Badge label={TASK_STATUS_LABEL[task.status]} /> : null}
              {task.priority === 'high' ? <Badge label="مهم" tone="warning" /> : null}
              {task.dueAt ? <Text variant="tiny">{formatJalaliDateTime(task.dueAt)}</Text> : null}
            </Row>
          </Column>
        </Pressable>
      </Row>
    </Card>
  );
}
