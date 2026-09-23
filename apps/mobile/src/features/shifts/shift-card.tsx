import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { Badge, Button, Card, Column, Row, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { formatJalaliDateTime } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { activeShiftQuery, shiftPatientsQuery, shiftProgress } from './queries';

/**
 * The shift, at the top of Today.
 *
 * One line when there is nothing to say — no shift open — and the round's
 * progress when there is. It does not list the patients: that is the shift
 * screen's job, and Today already has the admitted list below it.
 */
export function ShiftCard() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { data: shifts } = useLive(activeShiftQuery());
  const shift = shifts?.[0] ?? null;
  const { data: members } = useLive(shiftPatientsQuery(shift?.id ?? ''), [shift?.id]);
  const progress = shiftProgress(members ?? []);
  const remaining = progress.total - progress.seen;

  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/shift')}>
      <Card style={{ marginTop: spacing.lg, borderColor: shift ? colors.primary : colors.border, borderWidth: 1 }}>
        <Row justify="space-between" align="center">
          <Column gap="xxs" style={{ flex: 1 }}>
            <Text variant="subheading">{shift ? 'شیفت باز' : 'شیفتی باز نیست'}</Text>
            <Text variant="caption" color="textMuted">
              {shift
                ? [shift.ward, `از ${formatJalaliDateTime(shift.startAt)}`].filter(Boolean).join(' • ')
                : 'برای شروع بزنید'}
            </Text>
          </Column>
          {shift && progress.total > 0 ? (
            <Badge
              label={`${toPersianDigits(progress.seen)} از ${toPersianDigits(progress.total)}`}
              tone={progress.seen === progress.total ? 'success' : 'neutral'}
            />
          ) : null}
          <Ionicons name="chevron-back" size={18} color={colors.textFaint} />
        </Row>

        {shift && remaining > 0 ? (
          <Button
            label={`راند — ${toPersianDigits(remaining)} نفر مانده`}
            icon="walk-outline"
            variant="secondary"
            size="sm"
            onPress={() => router.push('/round')}
            style={{ marginTop: spacing.sm }}
          />
        ) : null}
      </Card>
    </Pressable>
  );
}
