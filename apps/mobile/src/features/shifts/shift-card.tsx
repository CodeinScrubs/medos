import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { Badge, Button, Card, Column, Row, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { formatJalaliDateTime } from '@/lib/jalali';
import { joinLabels, toPersianDigits } from '@/lib/persian';
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
  const { data: shifts, error, retry } = useLive(activeShiftQuery());
  const shift = shifts?.[0] ?? null;

  return (
    <Card style={{ marginTop: spacing.lg, borderColor: shift ? colors.primary : colors.border, borderWidth: 1 }}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/shift')}>
        <Row justify="space-between" align="center">
          <Column gap="xxs" style={{ flex: 1 }}>
            <Text variant="subheading">
              {shift ? 'شیفت باز' : shifts === undefined || error ? 'شیفت' : 'شیفتی باز نیست'}
            </Text>
            <Text variant="caption" color="textMuted">
              {shift
                ? joinLabels([shift.ward, `از ${formatJalaliDateTime(shift.startAt)}`])
                : error
                  ? 'برای مشاهده بزنید'
                  : shifts === undefined
                    ? 'در حال خواندن…'
                    : 'برای شروع بزنید'}
            </Text>
          </Column>
          <Ionicons name="chevron-back" size={18} color={colors.textFaint} />
        </Row>
      </Pressable>
      <ErrorNotice error={error} what="شیفت" onRetry={retry} />
      {shift && !error ? <ShiftRoundProgress key={shift.id} shiftId={shift.id} /> : null}
    </Card>
  );
}

/** A fresh mount per shift prevents the previous membership count from leaking across shifts. */
function ShiftRoundProgress({ shiftId }: { shiftId: string }) {
  const router = useRouter();
  const { data: members, error, retry } = useLive(shiftPatientsQuery(shiftId), [shiftId]);
  if (error) return <ErrorNotice error={error} what="بیماران شیفت" onRetry={retry} />;
  if (members === undefined)
    return (
      <Text variant="tiny" color="textFaint">
        در حال خواندن بیماران شیفت…
      </Text>
    );
  const progress = shiftProgress(members);
  if (!progress.total) return null;
  const remaining = progress.total - progress.seen;
  return (
    <Row justify="space-between" align="center" gap="sm">
      <Badge
        label={`${toPersianDigits(progress.seen)} از ${toPersianDigits(progress.total)}`}
        tone={remaining === 0 ? 'success' : 'neutral'}
      />
      {remaining > 0 ? (
        <Button
          label={`راند — ${toPersianDigits(remaining)} نفر مانده`}
          icon="walk-outline"
          variant="secondary"
          size="sm"
          onPress={() => router.push('/round')}
        />
      ) : null}
    </Row>
  );
}
