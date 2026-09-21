import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { alertError } from '@/components/feedback';
import { Badge, Button, Card, Column, Input, Row, SectionHeader, Text } from '@/components/ui';
import type { Consultation } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { doctorDisplayName } from '@/features/doctors/logic';
import { formatJalaliDateTime } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { answerConsult, cancelConsult, createConsult, markConsultRequested, patientConsultsQuery } from './queries';

const STATUS: Record<Consultation['status'], { label: string; tone: 'warning' | 'info' | 'success' | 'neutral' }> = {
  pending: { label: 'نوشته شده، هنوز درخواست نشده', tone: 'warning' },
  requested: { label: 'منتظر پاسخ', tone: 'info' },
  answered: { label: 'پاسخ داده شد', tone: 'success' },
  cancelled: { label: 'لغو شد', tone: 'neutral' },
};

/**
 * Consults for one patient: what was asked, and what is still owed.
 *
 * Each state change is a button someone presses, never something the app
 * decides — writing a consult down, actually asking for it, and getting an
 * answer are three separate events, and only the person who did them knows
 * which have happened.
 */
export function ConsultsSection({ patientId }: { patientId: string }) {
  const { spacing } = useTheme();
  const { data } = useLive(patientConsultsQuery(patientId), [patientId]);
  const rows = data ?? [];

  const [specialty, setSpecialty] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);
  const [response, setResponse] = useState('');
  const [instruction, setInstruction] = useState('');

  async function add() {
    if (!reason.trim()) {
      Alert.alert('سؤال کانسالت را بنویسید', 'مثلاً: افت فشار بعد از دیالیز، نظر قلب؟');
      return;
    }
    setBusy(true);
    try {
      await createConsult({ patientId, specialty: specialty || null, reason });
      setSpecialty('');
      setReason('');
    } catch (e) {
      alertError('ثبت نشد', e);
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(id: string) {
    if (!response.trim()) return;
    setBusy(true);
    try {
      await answerConsult(id, { response, followUpInstruction: instruction || null });
      setAnswering(null);
      setResponse('');
      setInstruction('');
    } catch (e) {
      alertError('ثبت نشد', e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionHeader title="کانسالت‌ها" count={rows.length} />
      <Column gap="sm">
        <Card tone="alt">
          <Column gap="sm">
            <Row gap="sm">
              <View style={styles.third}>
                <Input value={specialty} onChangeText={setSpecialty} placeholder="سرویس" />
              </View>
              <View style={styles.grow}>
                <Input value={reason} onChangeText={setReason} placeholder="سؤال کانسالت" />
              </View>
            </Row>
            <Button label="ثبت کانسالت" icon="add" onPress={() => void add()} loading={busy} />
          </Column>
        </Card>

        {rows.map(({ consult, doctor }) => (
          <Card key={consult.id}>
            <Column gap="sm">
              <Row justify="space-between" align="flex-start">
                <Column gap="xxs" style={styles.grow}>
                  <Text variant="bodyStrong">
                    {consult.specialty ?? (doctor ? doctorDisplayName(doctor) : 'کانسالت')}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {consult.reason}
                  </Text>
                </Column>
                <Badge label={STATUS[consult.status].label} tone={STATUS[consult.status].tone} />
              </Row>

              {consult.response ? (
                <Column gap="xxs" style={{ marginTop: spacing.xxs }}>
                  <Text variant="captionStrong">پاسخ</Text>
                  <Text variant="caption" color="textMuted">
                    {consult.response}
                  </Text>
                  {consult.followUpInstruction ? (
                    <>
                      <Text variant="captionStrong">دستور پیگیری</Text>
                      <Text variant="caption" color="textMuted">
                        {consult.followUpInstruction}
                      </Text>
                    </>
                  ) : null}
                  {consult.respondedAt ? (
                    <Text variant="tiny" color="textFaint">
                      {formatJalaliDateTime(consult.respondedAt)}
                    </Text>
                  ) : null}
                </Column>
              ) : null}

              {answering === consult.id ? (
                <Column gap="sm">
                  <Input label="پاسخ" value={response} onChangeText={setResponse} multiline />
                  <Input label="دستور پیگیری" value={instruction} onChangeText={setInstruction} multiline />
                  <Row gap="sm">
                    <Button
                      label="ثبت پاسخ"
                      icon="checkmark"
                      onPress={() => void submitAnswer(consult.id)}
                      loading={busy}
                    />
                    <Button label="انصراف" variant="ghost" haptic={false} onPress={() => setAnswering(null)} />
                  </Row>
                </Column>
              ) : (
                <Row gap="sm" wrap>
                  {consult.status === 'pending' ? (
                    <Button
                      label="درخواست شد"
                      icon="send-outline"
                      variant="secondary"
                      size="sm"
                      onPress={() => void markConsultRequested(consult.id)}
                    />
                  ) : null}
                  {consult.status === 'pending' || consult.status === 'requested' ? (
                    <>
                      <Button
                        label="ثبت پاسخ"
                        icon="chatbox-outline"
                        variant="secondary"
                        size="sm"
                        onPress={() => setAnswering(consult.id)}
                      />
                      <Button
                        label="لغو"
                        variant="ghost"
                        size="sm"
                        haptic={false}
                        onPress={() => void cancelConsult(consult.id)}
                      />
                    </>
                  ) : null}
                </Row>
              )}
            </Column>
          </Card>
        ))}
      </Column>
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  third: { width: 110 },
});
