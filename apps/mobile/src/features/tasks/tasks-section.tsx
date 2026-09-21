import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { alertError } from '@/components/feedback';
import { Badge, Button, Card, Column, Input, Row, SectionHeader, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { formatJalali } from '@/lib/jalali';
import { fullName } from '@/lib/persian';
import { useTheme } from '@/theme';

import { createTask, deleteTask, setTaskStatus, tasksQuery } from './queries';

/**
 * Open tasks, with a one-line way to add another.
 *
 * Used twice: on Today for the ones with no patient — "ring radiology" — and
 * on a patient's own screen. The add box is a single field on purpose. A task
 * that takes a form to create is a task that gets written on paper instead.
 */
export function TasksSection({
  patientId,
  shiftId,
  title = 'کارها',
  limit = 20,
}: {
  /** `null` for the global list, an id for one patient's. */
  patientId: string | null;
  shiftId?: string | null;
  title?: string;
  limit?: number;
}) {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { data } = useLive(tasksQuery({ patientId, status: 'open' }), [patientId]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = (data ?? []).slice(0, limit);

  async function add() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      await createTask({ title: text, patientId, shiftId: shiftId ?? null, source: 'typed' });
      setDraft('');
    } catch (e) {
      alertError('اضافه نشد', e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionHeader title={title} count={rows.length} />
      <Column gap="sm">
        <Row gap="sm">
          <View style={styles.grow}>
            <Input
              value={draft}
              onChangeText={setDraft}
              placeholder={patientId ? 'کاری برای این بیمار…' : 'مثلاً تماس با رادیولوژی'}
              onSubmitEditing={() => void add()}
              returnKeyType="done"
            />
          </View>
          <Button label="افزودن" icon="add" onPress={() => void add()} loading={busy} />
        </Row>

        {rows.map(({ task, patient }) => (
          <Card key={task.id}>
            <Row gap="sm" align="flex-start">
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: false }}
                accessibilityLabel="انجام شد"
                hitSlop={8}
                onPress={() => void setTaskStatus(task.id, 'done')}
              >
                <Ionicons name="ellipse-outline" size={24} color={colors.textFaint} />
              </Pressable>

              <Pressable
                style={styles.grow}
                onLongPress={() =>
                  Alert.alert('حذف این کار؟', task.title, [
                    { text: 'انصراف', style: 'cancel' },
                    { text: 'حذف', style: 'destructive', onPress: () => void deleteTask(task.id) },
                  ])
                }
                onPress={() =>
                  patient ? router.push({ pathname: '/patient/[id]', params: { id: patient.id } }) : undefined
                }
              >
                <Column gap="xxs">
                  <Text variant="body" numberOfLines={2}>
                    {task.title}
                  </Text>
                  <Row gap="xs" wrap>
                    {patient && !patientId ? <Badge label={fullName(patient.firstName, patient.lastName)} /> : null}
                    {task.dueAt ? (
                      <Text variant="tiny" color="textFaint">
                        {formatJalali(task.dueAt)}
                      </Text>
                    ) : null}
                  </Row>
                </Column>
              </Pressable>
            </Row>
          </Card>
        ))}

        {rows.length === 0 && data !== undefined ? (
          <Text variant="tiny" color="textFaint" style={{ marginBottom: spacing.xs }}>
            {patientId ? 'کاری برای این بیمار باز نیست.' : 'کار بازی نیست.'}
          </Text>
        ) : null}
      </Column>
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
