import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Badge, Button, Card, Column, Input, Row, SectionHeader, Text } from '@/components/ui';
import type { Consultation } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { doctorDisplayName } from '@/features/doctors/logic';
import { formatJalaliDateTime } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { cancelConsult, createConsult, markConsultRequested, patientConsultsQuery } from './queries';

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
  const router = useRouter();
  const { spacing } = useTheme();
  const { data, error } = useLive(patientConsultsQuery(patientId), [patientId]);
  const rows = data ?? [];

  const [specialty, setSpecialty] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const adding = useRef(false);

  async function add() {
    if (adding.current) return;
    if (!reason.trim()) {
      Alert.alert('سؤال کانسالت را بنویسید', 'مثلاً: افت فشار بعد از دیالیز، نظر قلب؟');
      return;
    }
    adding.current = true;
    setBusy(true);
    try {
      await createConsult({ patientId, specialty: specialty || null, reason });
      setSpecialty((current) => (current === specialty ? '' : current));
      setReason((current) => (current === reason ? '' : current));
    } catch (e) {
      alertError('ثبت نشد', e);
    } finally {
      adding.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <ErrorNotice error={error} what="کانسالت‌ها" />
      <SectionHeader title="کانسالت‌ها" count={rows.length} />
      <Column gap="sm">
        <Card tone="alt">
          <Column gap="sm">
            <Row gap="sm">
              <View style={styles.third}>
                <Input value={specialty} onChangeText={setSpecialty} placeholder="سرویس" editable={!busy} />
              </View>
              <View style={styles.grow}>
                <Input value={reason} onChangeText={setReason} placeholder="سؤال کانسالت" editable={!busy} />
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

              <Row gap="sm" wrap>
                {consult.status === 'pending' ? (
                  <Button
                    label="درخواست شد"
                    icon="send-outline"
                    variant="secondary"
                    size="sm"
                    onPress={() => void markConsultRequested(consult.id).catch((e) => alertError('تغییر ثبت نشد', e))}
                  />
                ) : null}
                {consult.status === 'pending' || consult.status === 'requested' ? (
                  <>
                    <Button
                      label={consult.draftResponse || consult.draftInstruction ? 'ادامهٔ پیش‌نویس پاسخ' : 'ثبت پاسخ'}
                      icon="chatbox-outline"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onPress={() => router.push({ pathname: '/consult-answer', params: { consultId: consult.id } })}
                    />
                    <Button
                      label="لغو"
                      variant="ghost"
                      size="sm"
                      haptic={false}
                      disabled={busy}
                      onPress={() => void cancelConsult(consult.id).catch((e) => alertError('تغییر ثبت نشد', e))}
                    />
                  </>
                ) : null}
                {consult.status === 'cancelled' && (consult.draftResponse || consult.draftInstruction) ? (
                  <Button
                    label="پیش‌نویس ثبت‌نشده"
                    variant="ghost"
                    size="sm"
                    onPress={() => router.push({ pathname: '/consult-answer', params: { consultId: consult.id } })}
                  />
                ) : null}
              </Row>
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
