import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { PromptModal } from '@/components/prompt-modal';
import { Badge, Button, Card, ChipSelect, Column, Input, Row, SectionHeader, Text } from '@/components/ui';
import type { Diagnosis } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { withDatasetWrite } from '@/lib/dataset-write';
import { useTheme } from '@/theme';

import { DIAGNOSIS_KIND_LABELS, DIAGNOSIS_STATUS_LABELS } from './labels';
import { addDiagnosis, deleteDiagnosis, patientDiagnosesQuery, setDiagnosisStatus, updateDiagnosis } from './queries';

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
  const { generation } = useDatasetIntent();
  const { colors, spacing } = useTheme();
  const { data, error } = useLive(patientDiagnosesQuery(patientId), [patientId]);
  const rows = data ?? [];

  const [title, setTitle] = useState('');
  const latestTitle = useRef('');
  const [chosenKind, setChosenKind] = useState<Diagnosis['kind'] | null>(null);
  const latestKind = useRef<Diagnosis['kind'] | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [editing, setEditing] = useState<Diagnosis | null>(null);

  const active = rows.filter((d) => d.status === 'active');
  const closed = rows.filter((d) => d.status !== 'active');
  // The first problem written down is usually the main one; the chip shows
  // the choice and one tap changes it.
  const kind = chosenKind ?? (active.length === 0 ? 'primary' : 'secondary');

  async function add() {
    if (submitting.current) return;
    const text = latestTitle.current.trim();
    if (!text) return;
    submitting.current = true;
    setBusy(true);
    try {
      await withDatasetWrite(generation, () =>
        addDiagnosis({ patientId, title: text, kind: latestKind.current ?? kind }),
      );
      latestTitle.current = '';
      latestKind.current = null;
      setTitle('');
      setChosenKind(null);
    } catch (e) {
      alertError('اضافه نشد', e);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function correct(text: string) {
    if (submitting.current || !editing || !text) return;
    const row = editing;
    submitting.current = true;
    setBusy(true);
    try {
      await withDatasetWrite(generation, async () => {
        if (text !== row.title) await updateDiagnosis(row.id, { title: text });
      });
      setEditing(null);
    } catch (e) {
      alertError('اصلاح نشد', e);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function askStatus(row: Diagnosis) {
    Alert.alert(row.title, undefined, [
      { text: 'اصلاح متن', onPress: () => setEditing(row) },
      ...(row.status === 'active'
        ? [
            {
              text: 'برطرف شد',
              onPress: () =>
                void withDatasetWrite(generation, () => setDiagnosisStatus(row.id, 'resolved')).catch((e) =>
                  alertError('تغییر ثبت نشد', e),
                ),
            },
            {
              text: 'رد شد',
              onPress: () =>
                void withDatasetWrite(generation, () => setDiagnosisStatus(row.id, 'ruled_out')).catch((e) =>
                  alertError('تغییر ثبت نشد', e),
                ),
            },
          ]
        : [
            {
              text: 'دوباره فعال',
              onPress: () =>
                void withDatasetWrite(generation, () => setDiagnosisStatus(row.id, 'active')).catch((e) =>
                  alertError('تغییر ثبت نشد', e),
                ),
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
              editable={!busy}
              onChangeText={(value) => {
                if (!submitting.current) {
                  latestTitle.current = value;
                  setTitle(value);
                }
              }}
              placeholder="مثلاً CKD stage 3"
              onSubmitEditing={() => void add()}
              returnKeyType="done"
              ltr
            />
          </View>
          <Button label="افزودن" icon="add" variant="secondary" onPress={() => void add()} loading={busy} />
        </Row>
        {/* Always visible, so the kind can be picked before typing: shown only while
            typing, the chip needed a tap with the keyboard up, and a tap that only
            closed the keyboard saved the default kind instead. */}
        <ChipSelect
          options={KINDS}
          value={kind}
          onChange={(v) => {
            if (!submitting.current && v) {
              latestKind.current = v;
              setChosenKind(v);
            }
          }}
        />

        {rows.length === 0 && data !== undefined ? (
          <Text variant="tiny" color="textFaint" style={{ marginBottom: spacing.xs }}>
            هنوز تشخیصی ثبت نشده.
          </Text>
        ) : null}

        {[...active, ...closed].map((row) => (
          <Pressable
            key={row.id}
            disabled={busy}
            onPress={() => askStatus(row)}
            onLongPress={() =>
              Alert.alert('حذف این تشخیص؟', row.title, [
                { text: 'انصراف', style: 'cancel' },
                {
                  text: 'حذف',
                  style: 'destructive',
                  onPress: () =>
                    void withDatasetWrite(generation, () => deleteDiagnosis(row.id)).catch((e) =>
                      alertError('حذف نشد', e),
                    ),
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
            برای اصلاح یا تغییر وضعیت روی تشخیص بزنید؛ برای حذف، نگه دارید.
          </Text>
        ) : null}
      </Column>

      <PromptModal
        visible={editing != null}
        title="اصلاح تشخیص"
        initialValue={editing?.title ?? ''}
        submitLabel="ذخیره"
        optional={false}
        busy={busy}
        onCancel={() => {
          if (!submitting.current) setEditing(null);
        }}
        onSubmit={(text) => void correct(text)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  faded: { opacity: 0.6 },
  grow: { flex: 1 },
  ltr: { writingDirection: 'ltr' },
});
