import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { Badge, Card, Column, Row, SectionHeader, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { formatRelativeTime } from '@/lib/jalali';
import { fullName } from '@/lib/persian';

import { openConsultsQuery } from './queries';

/**
 * Consults still owed an answer, across everyone.
 *
 * The reason this exists: an unanswered consult is an absence, and absences
 * are invisible in a patient's notes. Here it is a row that stays until
 * somebody says what the answer was.
 */
export function OpenConsults() {
  const router = useRouter();
  const { data } = useLive(openConsultsQuery());
  const rows = data ?? [];

  if (rows.length === 0) return null;

  return (
    <>
      <SectionHeader title="کانسالت‌های بی‌پاسخ" count={rows.length} />
      <Column gap="sm">
        {rows.map(({ consult, patient }) => (
          <Pressable
            key={consult.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/patient/[id]', params: { id: patient.id } })}
          >
            <Card>
              <Row justify="space-between" align="flex-start">
                <Column gap="xxs" style={{ flex: 1 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {fullName(patient.firstName, patient.lastName)}
                    {consult.specialty ? ` — ${consult.specialty}` : ''}
                  </Text>
                  <Text variant="caption" color="textMuted" numberOfLines={2}>
                    {consult.reason}
                  </Text>
                </Column>
                <Column gap="xxs" style={{ alignItems: 'flex-end' }}>
                  <Row gap="xs">
                    {consult.urgency !== 'routine' ? (
                      <Badge
                        label={consult.urgency === 'emergency' ? 'اورژانسی' : 'فوری'}
                        tone={consult.urgency === 'emergency' ? 'danger' : 'warning'}
                      />
                    ) : null}
                    <Badge
                      label={consult.status === 'pending' ? 'درخواست نشده' : 'منتظر پاسخ'}
                      tone={consult.status === 'pending' ? 'warning' : 'info'}
                    />
                  </Row>
                  <Text variant="tiny" color="textFaint">
                    {formatRelativeTime(consult.requestedAt ?? consult.createdAt)}
                  </Text>
                </Column>
              </Row>
            </Card>
          </Pressable>
        ))}
      </Column>
    </>
  );
}
