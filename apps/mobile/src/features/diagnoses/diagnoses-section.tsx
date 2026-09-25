import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Badge, Button, Card, ChipSelect, Column, Input, Row, SectionHeader, Text } from '@/components/ui';
import type { Diagnosis } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { useTheme } from '@/theme';

import { DIAGNOSIS_KIND_LABELS, DIAGNOSIS_STATUS_LABELS } from './labels';
import { addDiagnosis, deleteDiagnosis, patientDiagnosesQuery, setDiagnosisStatus } from './queries';

const KINDS: { value: Diagnosis['kind']; label: string }[] = (
  ['primary', 'secondary', 'rule_out', 'complication', 'past'] as const
).map((value) => ({ value, label: DIAGNOSIS_KIND_LABELS[value] }));

const STATUS_TONE: Record<Diagnosis['status'], 'success' | 'neutral' | 'info'> = {
  active: 'info',
  resolved: 'success',
  ruled_out: 'neutral',
};

/**
 * The problem list.
 *
 * A note says what was thought on a day; this says what is being carried, and
 * that is the question asked at a bedside. Resolved and ruled-out problems
 * stay on the list, below the live ones — what was ruled out is part of the
 * reasoning, and deleting it invites the same workup a second time.
 *
 * The add box is one field. A problem list that needs a form to add to is a
 * problem list that gets kept somewhere else.
 */
export function DiagnosesSection({ patientId }: { patientId: string }) {
  const { colors, spacing } = useTheme();
  const { data, error } = useLive(patientDiagnosesQuery(patientId), [patientId]);
  const rows = data ?? [];

  const [title, setTitle] = useState('');
  const [chosenKind, setChosenKind] = useState<Diagnosis['kind'] | null>(null);
  const [busy, setBusy] = useState(false);

  const active = rows.filter((d) => d.status === 'active');
  const closed = rows.filter((d) => d.status !== 'active');
  // The first problem written down is usually the main one; the chip shows
  // the choice and one tap changes it.
  const kind = chosenKind ?? (active.length === 0 ? 'primary' : 'secondary');

  async function add() {
    const text = title.trim();
    if (!text) return;
    setBusy(true);
    try {
      await addDiagnosis({ patientId, title: text, kind });
      setTitle('');
      setChosenKind(null);
    } catch (e) {
      alertError('اضافه نشد', e);
    } finally {
      setBusy(false);
    }
  }

  function askStatus(row: Diagnosis) {
    Alert.alert(row.title, undefined, [
      ...(row.status === 'active'
        ? [
            {
              text: 'برطرف شد',
              onPress: () => void setDiagnosisStatus(row.id, 'resolved').catch((e) => alertError('تغییر ثبت نشد', e)),
            },
            {
              text: 'رد شد',
              onPress: () => void setDiagnosisStatus(row.id, 'ruled_out').catch((e) => alertError('تغییر ثبت نشد', e)),
            },
          ]
        : [
            {
              text: 'دوباره فعال',
              onPress: () => void setDiagnosisStatus(row.id, 'active').catch((e) => alertError('تغییر ثبت نشد', e)),
            },
          ]),
      { text: 'انصراف', style: 'cancel' as const },
    ]);
  }

  return (
    <>
      <ErrorNotice error={error} what="تشخیص‌ها" />
      <SectionHeader title="تشخیص‌ها" count={active.length} />
      <Column gap="sm">
        <Row gap="sm">
          <View style={styles.grow}>
            <Input
              value={title}
              onChangeText={setTitle}
              placeholder="مثلاً CKD stage 3"
              onSubmitEditing={() => void add()}
              returnKeyType="done"
              ltr
            />
          </View>
          <Button label="افزودن" icon="add" variant="secondary" onPress={() => void add()} loading={busy} />
        </Row>
        {title.trim() ? <ChipSelect options={KINDS} value={kind} onChange={(v) => v && setChosenKind(v)} /> : null}

        {rows.length === 0 && data !== undefined ? (
          <Text variant="tiny" color="textFaint" style={{ marginBottom: spacing.xs }}>
            هنوز تشخیصی ثبت نشده.
          </Text>
        ) : null}

        {[...active, ...closed].map((row) => (
          <Pressable
            key={row.id}
            onPress={() => askStatus(row)}
            onLongPress={() =>
              Alert.alert('حذف این تشخیص؟', row.title, [
                { text: 'انصراف', style: 'cancel' },
                {
                  text: 'حذف',
                  style: 'destructive',
                  onPress: () => void deleteDiagnosis(row.id).catch((e) => alertError('حذف نشد', e)),
                },
              ])
            }
          >
            <Card style={row.status === 'active' ? undefined : styles.faded}>
              <Row justify="space-between" gap="sm" align="flex-start">
                <Column gap="xxs" style={styles.grow}>
                  <Text variant="bodyStrong" style={styles.ltr}>
                    {row.title}
                  </Text>
                  <Row gap="xs" wrap>
                    <Text variant="tiny" color="textFaint">
                      {DIAGNOSIS_KIND_LABELS[row.kind]}
                    </Text>
                    {row.icdCode ? (
                      <Text variant="tiny" color="textFaint" style={styles.ltr}>
                        {row.icdCode}
                      </Text>
                    ) : null}
                  </Row>
                  {row.notes ? (
                    <Text variant="caption" color="textMuted" numberOfLines={2}>
                      {row.notes}
                    </Text>
                  ) : null}
                </Column>
                <Badge label={DIAGNOSIS_STATUS_LABELS[row.status]} tone={STATUS_TONE[row.status]} />
              </Row>
            </Card>
          </Pressable>
        ))}

        {rows.length > 0 ? (
          <Text variant="tiny" color="textFaint" style={{ color: colors.textFaint }}>
            برای تغییر وضعیت روی تشخیص بزنید؛ برای حذف، نگه دارید.
          </Text>
        ) : null}
      </Column>
    </>
  );
}

const styles = StyleSheet.create({
  faded: { opacity: 0.6 },
  grow: { flex: 1 },
  ltr: { writingDirection: 'ltr' },
});
