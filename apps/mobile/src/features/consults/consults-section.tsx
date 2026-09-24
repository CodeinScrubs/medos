import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import { useAutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Badge, Button, Card, Column, Row, SectionHeader, Text } from '@/components/ui';
import type { Consultation } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { doctorDisplayName } from '@/features/doctors/logic';
import { formatJalaliDateTime } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { cancelConsult, markConsultRequested, patientConsultsQuery } from './queries';
import { ConsultRequestEditor } from './request-editor';

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
  const scope = useAutosaveScope()!;
  const { spacing } = useTheme();
  const { data, error } = useLive(patientConsultsQuery(patientId), [patientId]);
  const rows = data ?? [];

  function openAnswer(consultId: string) {
    void scope.perform(() => router.push({ pathname: '/consult-answer', params: { consultId } }));
  }

  return (
    <>
      <ErrorNotice error={error} what="کانسالت‌ها" />
      <SectionHeader title="کانسالت‌ها" count={rows.length} />
      <Column gap="sm">
        <ConsultRequestEditor patientId={patientId} />

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
                      onPress={() => openAnswer(consult.id)}
                    />
                    <Button
                      label="لغو"
                      variant="ghost"
                      size="sm"
                      haptic={false}
                      onPress={() => void cancelConsult(consult.id).catch((e) => alertError('تغییر ثبت نشد', e))}
                    />
                  </>
                ) : null}
                {consult.status === 'cancelled' && (consult.draftResponse || consult.draftInstruction) ? (
                  <Button label="پیش‌نویس ثبت‌نشده" variant="ghost" size="sm" onPress={() => openAnswer(consult.id)} />
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
});
