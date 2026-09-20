import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { TrendChart, type TrendPoint } from '@/components/trend-chart';
import { Card, Column, Divider, EmptyState, Row, Screen, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { FLAG_LABEL, flagTone, formatRange } from '@/features/labs/flags';
import { sameUnitSeries } from '@/features/labs/logic';
import { analyteSeriesQuery } from '@/features/labs/queries';
import { formatJalali, formatJalaliDateTime, toJalali } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

/** One analyte's history for one patient. Params: `id` (patient), `analyte`. */
export function TrendScreen() {
  const { id: patientId, analyte } = useLocalSearchParams<{ id: string; analyte: string }>();
  const { colors, spacing } = useTheme();
  const { data } = useLive(analyteSeriesQuery(patientId, analyte), [patientId, analyte]);
  const rows = data ?? [];

  // Only results in the same unit share an axis; the rest are counted below.
  const { series, excluded, unlabelled } = sameUnitSeries(rows.map((r) => ({ ...r, unit: r.value.unit })));
  const numeric: TrendPoint[] = series
    .filter((r) => r.value.valueNum != null)
    .map((r) => ({ at: r.collectedAt, value: r.value.valueNum!, flag: r.value.flag }));

  // The most recent row's range is the one worth drawing: labs change ranges
  // when they change methods, and the latest is what today's values are read against.
  const latest = rows[rows.length - 1]?.value;
  const unit = latest?.unit;

  return (
    <>
      <Stack.Screen options={{ title: analyte }} />
      <Screen scroll>
        <Column gap="md" style={{ paddingTop: spacing.md }}>
          {rows.length === 0 ? (
            <EmptyState icon="analytics-outline" title="مقداری ثبت نشده" />
          ) : (
            <>
              <Card>
                <Row justify="space-between" style={{ marginBottom: spacing.sm }}>
                  <Text variant="heading" ltr>
                    {analyte}
                    {unit ? ` (${unit})` : ''}
                  </Text>
                  {latest && (latest.refLow != null || latest.refHigh != null) ? (
                    <Text variant="tiny" color="textFaint" ltr>
                      ref {formatRange(latest.refLow, latest.refHigh)}
                    </Text>
                  ) : null}
                </Row>
                {numeric.length >= 2 ? (
                  <TrendChart
                    points={numeric}
                    refLow={latest?.refLow}
                    refHigh={latest?.refHigh}
                    formatDate={(d) => {
                      const { jm, jd } = toJalali(d);
                      return toPersianDigits(`${jm}/${jd}`);
                    }}
                  />
                ) : (
                  <Text variant="caption" color="textFaint">
                    برای نمودار حداقل دو مقدار عددی لازم است.
                  </Text>
                )}
                {unlabelled > 0 ? (
                  <Text variant="tiny" color="textFaint" style={{ marginTop: spacing.xs }}>
                    {toPersianDigits(unlabelled)} مقدار بدون واحد ثبت شده و همین واحد برایشان فرض شده است.
                  </Text>
                ) : null}
                {excluded > 0 ? (
                  <Text variant="tiny" color="warning" style={{ marginTop: spacing.xs }}>
                    {toPersianDigits(excluded)} مقدار با واحد دیگر در نمودار نیامد (واحدها تبدیل نمی‌شوند). در جدول
                    پایین همه هست.
                  </Text>
                ) : null}
              </Card>

              <Card padded={false}>
                {[...rows].reverse().map((r, i) => {
                  const tone = flagTone(r.value.flag);
                  const color =
                    tone === 'danger'
                      ? colors.danger
                      : tone === 'warning'
                        ? colors.warning
                        : tone === 'info'
                          ? colors.info
                          : colors.text;
                  return (
                    <View key={r.value.id}>
                      {i > 0 && <Divider />}
                      <Row
                        justify="space-between"
                        style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}
                      >
                        <Text variant="caption" color="textMuted">
                          {formatJalaliDateTime(r.collectedAt)}
                        </Text>
                        <Row gap="xs">
                          <Text numeric style={{ color }}>
                            {r.value.value}
                          </Text>
                          {r.value.flag && r.value.flag !== 'normal' ? (
                            <Text variant="captionStrong" ltr style={{ color }}>
                              {FLAG_LABEL[r.value.flag]}
                            </Text>
                          ) : null}
                        </Row>
                      </Row>
                    </View>
                  );
                })}
              </Card>

              <Text variant="tiny" color="textFaint">
                {toPersianDigits(rows.length)} مقدار از {formatJalali(rows[0]?.collectedAt)} تا{' '}
                {formatJalali(rows.at(-1)?.collectedAt)}
              </Text>
            </>
          )}
        </Column>
      </Screen>
    </>
  );
}
