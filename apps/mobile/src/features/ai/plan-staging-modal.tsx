import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { alertError, notify } from '@/components/feedback';
import { Button, Card, Column, Divider, IconButton, Input, Row, Text, Toggle } from '@/components/ui';
import { useTheme } from '@/theme';

import type { ParsedAiPlan, ParsedConsult, ParsedLab, ParsedMedication, ParsedTask } from './parser';
import { commitAiPlan } from './queries';

export function PlanStagingModal({
  visible,
  patientId,
  plan,
  onClose,
  onCommitted,
}: {
  visible: boolean;
  patientId: string;
  plan: ParsedAiPlan | null;
  onClose: () => void;
  onCommitted: () => void;
}) {
  const { colors, radii, spacing, shadows } = useTheme();

  const committingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState(true);
  const [assessment, setAssessment] = useState(plan?.assessment ?? '');
  const [note, setNote] = useState(plan?.note ?? '');
  const [meds, setMeds] = useState<ParsedMedication[]>(plan?.medications ?? []);
  const [labs, setLabs] = useState<ParsedLab[]>(plan?.labs ?? []);
  const [consults, setConsults] = useState<ParsedConsult[]>(plan?.consults ?? []);
  const [tasks, setTasks] = useState<ParsedTask[]>(plan?.tasks ?? []);

  // Update internal state when plan changes
  const [lastPlan, setLastPlan] = useState(plan);
  if (plan !== lastPlan) {
    setLastPlan(plan);
    setAssessment(plan?.assessment ?? '');
    setNote(plan?.note ?? '');
    setMeds(plan?.medications ?? []);
    setLabs(plan?.labs ?? []);
    setConsults(plan?.consults ?? []);
    setTasks(plan?.tasks ?? []);
    setSaveNote(Boolean(plan?.note || plan?.assessment));
  }

  if (!plan) return null;

  const totalSelected =
    (saveNote && (note.trim() || assessment.trim()) ? 1 : 0) +
    meds.filter((m) => m.selected).length +
    labs.filter((l) => l.selected).length +
    consults.filter((c) => c.selected).length +
    tasks.filter((t) => t.selected).length;

  const handleCommit = async () => {
    if (committingRef.current) return;
    if (totalSelected === 0) {
      notify('هیچ موردی انتخاب نشده است', 'حداقل یک دارو، آزمایش، تسک یا نوت را برای ثبت انتخاب کنید.');
      return;
    }

    committingRef.current = true;
    setSaving(true);
    try {
      await commitAiPlan({
        patientId,
        saveNote,
        assessmentText: assessment,
        noteText: note,
        medications: meds,
        labs,
        consults,
        tasks,
      });

      notify('برنامه بالینی با موفقیت ثبت شد', `${totalSelected} مورد به پرونده، کاردکس و تسک‌های بیمار اضافه شد.`);
      onCommitted();
      onClose();
    } catch (e) {
      committingRef.current = false;
      setSaving(false);
      alertError('ثبت برنامه انجام نشد', e);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <Row align="center" justify="space-between" style={[styles.header, { borderBottomColor: colors.border }]}>
          <Column gap="xs" style={{ flex: 1 }}>
            <Row gap="xs" align="center">
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
              <Text variant="heading">بررسی و تأیید پزشک (Staging Gate)</Text>
            </Row>
            <Text variant="tiny" color="textMuted">
              پیشنهادات هوش مصنوعی را قبل از ثبت نهایی بررسی و در صورت نیاز ویرایش کنید.
            </Text>
          </Column>
          <IconButton icon="close" label="بستن" onPress={onClose} disabled={saving} />
        </Row>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge * 2 }}>
          <Column gap="lg">
            {plan.warnings.length > 0 && (
              <Card tone="alt">
                <Row gap="sm" align="center">
                  <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
                  <Column gap="none" style={{ flex: 1 }}>
                    {plan.warnings.map((w, idx) => (
                      <Text key={idx} variant="caption" color="textMuted">
                        {w}
                      </Text>
                    ))}
                  </Column>
                </Row>
              </Card>
            )}

            {/* Note & Assessment */}
            <Card>
              <Column gap="sm">
                <Row justify="space-between" align="center">
                  <Text variant="captionStrong">ارزیابی و نوت ویزیت بالینی</Text>
                  <Toggle value={saveNote} onChange={setSaveNote} label="ثبت در نوت‌ها" disabled={saving} />
                </Row>
                <Divider />
                {saveNote && (
                  <>
                    <Input
                      label="ارزیابی بالینی (Assessment)"
                      value={assessment}
                      onChangeText={setAssessment}
                      multiline
                      editable={!saving}
                      placeholder="خلاصه وضعیت بالینی بیمار..."
                    />
                    <Input
                      label="طرح درمان و یادداشت پیشرفت (Plan / Note)"
                      value={note}
                      onChangeText={setNote}
                      multiline
                      editable={!saving}
                      placeholder="متن شرح حال و طرح درمانی..."
                    />
                  </>
                )}
              </Column>
            </Card>

            {/* Medications */}
            {meds.length > 0 && (
              <Card>
                <Column gap="sm">
                  <Row justify="space-between" align="center">
                    <Row gap="xs" align="center">
                      <Ionicons name="medical-outline" size={18} color={colors.primary} />
                      <Text variant="captionStrong">داروهای پیشنهادی کاردکس ({meds.length})</Text>
                    </Row>
                  </Row>
                  <Divider />
                  {meds.map((m, idx) => (
                    <View
                      key={m.id}
                      style={[
                        styles.itemBox,
                        { borderColor: m.selected ? colors.primary : colors.border, borderRadius: radii.md },
                      ]}
                    >
                      <Row align="center" gap="sm" style={{ marginBottom: spacing.xs }}>
                        <Toggle
                          value={m.selected}
                          onChange={(val) => {
                            const next = [...meds];
                            next[idx] = { ...m, selected: val };
                            setMeds(next);
                          }}
                          label={m.drug || `دارو #${idx + 1}`}
                          disabled={saving}
                        />
                      </Row>
                      {m.selected && (
                        <Column gap="xs" style={{ marginTop: spacing.xs }}>
                          <Input
                            label="نام دارو"
                            value={m.drug}
                            onChangeText={(v) => {
                              const next = [...meds];
                              next[idx] = { ...m, drug: v };
                              setMeds(next);
                            }}
                            editable={!saving}
                          />
                          <Row gap="sm">
                            <View style={{ flex: 1 }}>
                              <Input
                                label="دوز"
                                value={m.dose}
                                onChangeText={(v) => {
                                  const next = [...meds];
                                  next[idx] = { ...m, dose: v };
                                  setMeds(next);
                                }}
                                editable={!saving}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Input
                                label="روش مصرف"
                                value={m.route}
                                onChangeText={(v) => {
                                  const next = [...meds];
                                  next[idx] = { ...m, route: v };
                                  setMeds(next);
                                }}
                                editable={!saving}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Input
                                label="توالی"
                                value={m.frequency}
                                onChangeText={(v) => {
                                  const next = [...meds];
                                  next[idx] = { ...m, frequency: v };
                                  setMeds(next);
                                }}
                                editable={!saving}
                              />
                            </View>
                          </Row>
                          {m.instructions ? (
                            <Input
                              label="دستور مصرف / توضیحات"
                              value={m.instructions}
                              onChangeText={(v) => {
                                const next = [...meds];
                                next[idx] = { ...m, instructions: v };
                                setMeds(next);
                              }}
                              editable={!saving}
                            />
                          ) : null}
                        </Column>
                      )}
                    </View>
                  ))}
                </Column>
              </Card>
            )}

            {/* Labs */}
            {labs.length > 0 && (
              <Card>
                <Column gap="sm">
                  <Row gap="xs" align="center">
                    <Ionicons name="flask-outline" size={18} color={colors.primary} />
                    <Text variant="captionStrong">درخواست آزمایش‌ها ({labs.length})</Text>
                  </Row>
                  <Divider />
                  {labs.map((l, idx) => (
                    <Row key={l.id} align="center" justify="space-between" style={{ paddingVertical: 4 }}>
                      <Toggle
                        value={l.selected}
                        onChange={(val) => {
                          const next = [...labs];
                          next[idx] = { ...l, selected: val };
                          setLabs(next);
                        }}
                        label={`${l.analyte}${l.timing ? ` (${l.timing})` : ''}`}
                        disabled={saving}
                      />
                    </Row>
                  ))}
                </Column>
              </Card>
            )}

            {/* Consults */}
            {consults.length > 0 && (
              <Card>
                <Column gap="sm">
                  <Row gap="xs" align="center">
                    <Ionicons name="chatbubbles-outline" size={18} color={colors.primary} />
                    <Text variant="captionStrong">درخواست مشاوره‌ها ({consults.length})</Text>
                  </Row>
                  <Divider />
                  {consults.map((c, idx) => (
                    <View
                      key={c.id}
                      style={[
                        styles.itemBox,
                        { borderColor: c.selected ? colors.primary : colors.border, borderRadius: radii.md },
                      ]}
                    >
                      <Toggle
                        value={c.selected}
                        onChange={(val) => {
                          const next = [...consults];
                          next[idx] = { ...c, selected: val };
                          setConsults(next);
                        }}
                        label={c.specialty}
                        disabled={saving}
                      />
                      {c.selected && (
                        <Column gap="xs" style={{ marginTop: spacing.xs }}>
                          <Input
                            label="سؤال بالینی / دلیل مشاوره"
                            value={c.reason}
                            onChangeText={(v) => {
                              const next = [...consults];
                              next[idx] = { ...c, reason: v };
                              setConsults(next);
                            }}
                            editable={!saving}
                          />
                        </Column>
                      )}
                    </View>
                  ))}
                </Column>
              </Card>
            )}

            {/* Tasks */}
            {tasks.length > 0 && (
              <Card>
                <Column gap="sm">
                  <Row gap="xs" align="center">
                    <Ionicons name="checkbox-outline" size={18} color={colors.primary} />
                    <Text variant="captionStrong">اقدامات و تسک‌های شیفت ({tasks.length})</Text>
                  </Row>
                  <Divider />
                  {tasks.map((t, idx) => (
                    <Row key={t.id} align="center" justify="space-between" style={{ paddingVertical: 4 }}>
                      <Toggle
                        value={t.selected}
                        onChange={(val) => {
                          const next = [...tasks];
                          next[idx] = { ...t, selected: val };
                          setTasks(next);
                        }}
                        label={`${t.text}${t.due ? ` [زمان: ${t.due}]` : ''}`}
                        disabled={saving}
                      />
                    </Row>
                  ))}
                </Column>
              </Card>
            )}
          </Column>
        </ScrollView>

        {/* Action Footer */}
        <View
          style={[
            styles.footer,
            shadows.lg,
            { backgroundColor: colors.surface, borderTopColor: colors.border, padding: spacing.md },
          ]}
        >
          <Button
            label={`تأیید و ثبت ${totalSelected} مورد در پرونده`}
            icon="checkmark-circle-outline"
            onPress={handleCommit}
            loading={saving}
            full
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  itemBox: { padding: 10, borderWidth: StyleSheet.hairlineWidth, marginVertical: 4 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
});
