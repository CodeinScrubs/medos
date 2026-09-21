import { Ionicons } from '@expo/vector-icons';

import { Badge, Card, Column, Row, Text } from '@/components/ui';
import type { Consultation, Doctor } from '@/db/schema';
import { doctorDisplayName } from '@/features/doctors/logic';
import { useTheme } from '@/theme';

import { OPEN_STATUSES } from './queries';

/**
 * What is still owed on this patient, in one line each.
 *
 * Read-only on purpose. At the bedside the useful question is "is anything
 * outstanding", and answering a consult is a desk job that needs the specialist's
 * actual words — a text field on a round card invites a summary from memory.
 */
export function ConsultsBrief({ rows }: { rows: { consult: Consultation; doctor: Doctor | null }[] }) {
  const { colors, spacing } = useTheme();
  const open = rows.filter((r) => OPEN_STATUSES.includes(r.consult.status));

  if (open.length === 0) return null;

  return (
    <Card tone="alt">
      <Column gap="sm">
        <Row gap="xs" align="center">
          <Ionicons name="chatbubbles-outline" size={16} color={colors.warning} />
          <Text variant="captionStrong">کانسالت بی‌پاسخ</Text>
        </Row>
        {open.map(({ consult, doctor }) => (
          <Row key={consult.id} justify="space-between" gap="sm" align="flex-start">
            <Column gap="xxs" style={{ flex: 1 }}>
              <Text variant="caption">{consult.specialty ?? (doctor ? doctorDisplayName(doctor) : 'کانسالت')}</Text>
              <Text variant="tiny" color="textMuted" numberOfLines={2}>
                {consult.reason}
              </Text>
            </Column>
            <Badge
              label={consult.status === 'pending' ? 'هنوز درخواست نشده' : 'منتظر پاسخ'}
              tone={consult.status === 'pending' ? 'warning' : 'info'}
            />
          </Row>
        ))}
        <Text variant="tiny" color="textFaint" style={{ marginTop: spacing.xxs }}>
          پاسخ را از پرونده‌ی بیمار ثبت کنید.
        </Text>
      </Column>
    </Card>
  );
}
