import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { PickerModal } from '@/components/picker-modal';
import { ScreenOptions } from '@/components/screen-options';
import { TrendChart, type TrendPoint } from '@/components/trend-chart';
import { Card, Column, Divider, EmptyState, Row, Screen, SelectField, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { FLAG_LABEL, flagTone, formatRange, parseLabValue } from '@/features/labs/flags';
import { labSeriesGroups } from '@/features/labs/logic';
import { patientLabOwnershipIssuesQuery } from '@/features/labs/ownership-queries';
import { analyteSeriesQuery } from '@/features/labs/queries';
import { formatJalali, formatJalaliDateTime, toJalali } from '@/lib/jalali';
import { joinLabels, ltrIsolate, toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

/** One analyte's history for one patient. Params: `id` (patient), `analyte`. */
export function TrendScreen() {
  const { id: patientId, analyte } = useLocalSearchParams<{ id: string; analyte: string }>();
  return <Trend key={JSON.stringify([patientId, analyte])} patientId={patientId} analyte={analyte} />;
}

function Trend({ patientId, analyte }: { patientId: string; analyte: string }) {
  const { colors, spacing } = useTheme();
  const results = useLive(analyteSeriesQuery(patientId, analyte), [patientId, analyte]);
  const issues = useLive(patientLabOwnershipIssuesQuery(patientId), [patientId]);
  const failures = [results, issues].filter((source) => source.error);
  const data = failures.length ? undefined : results.data;
  const rows = data ?? [];
  const [selected, setSelected] = useState<string>();
  const [picking, setPicking] = useState(false);

  const groups = useMemo(() => labSeriesGroups(data ?? []), [data]);
  const choices = [...groups]
    .map(([id, group]) => {
      const row = group.at(-1)!;
      return {
        id,
        label: contextLabel(row),
        sublabel: joinLabels([
          row.value.unit?.trim() || 'بدون واحد ثبت‌شده',
          row.value.refLow != null || row.value.refHigh != null
            ? formatRange(row.value.refLow, row.value.refHigh)
            : null,
          formatJalali(row.collectedAt),
        ]),
        at: row.collectedAt.getTime(),
      };
    })
    .sort((a, b) => b.at - a.at);
  const choice = choices.find((item) => item.id === selected) ?? choices[0];
  const series = (choice && groups.get(choice.id)) || [];
  const numeric: TrendPoint[] = series
    .filter((r) => r.value.valueNum != null)
    .map((r) => {
      // `>100` is stored as the text it was typed as and the number 100. On a
      // chart those are not the same thing, so the point says which it is.
      const comparator = parseLabValue(r.value.value)?.comparator ?? null;
      return {
        at: r.collectedAt,
        value: r.value.valueNum!,
        flag: r.value.flag,
        bound: comparator === '>' || comparator === '>=' ? 'above' : comparator ? 'below' : null,
      };
    });
  const legend = numeric.some((p) => p.bound) ? 'مثلث: عدد دقیق نیست' : null;
  const latest = series.at(-1)?.value;
  const unit = latest?.unit?.trim();
  const excluded = rows.length - series.length;

  return (
    <>
      <ScreenOptions options={{ title: analyte }} />
      <Screen scroll>
        <Column gap="md" style={{ paddingTop: spacing.md }}>
          <ErrorNotice
            error={failures[0]?.error}
            what="روند آزمایش"
            onRetry={() => failures.forEach((source) => source.retry())}
          />
          {(issues.data?.[0]?.count ?? 0) > 0 ? (
            <Text variant="caption" color="warning">
              ارتباط بیمار در بعضی برگه‌ها نیاز به بررسی دارد؛ نتایج آن‌ها در روند نمایش داده نمی‌شود.
            </Text>
          ) : null}
          {rows.length === 0 ? (
            data && issues.data && !failures.length ? (
              <EmptyState
                icon="analytics-outline"
                title={(issues.data?.[0]?.count ?? 0) > 0 ? 'مقدار قابل نمایش وجود ندارد' : 'مقداری ثبت نشده'}
              />
            ) : null
          ) : (
            <>
              <Card>
                {choices.length > 1 ? (
                  <SelectField
                    label="گروه نمودار"
                    value={joinLabels([choice?.label, choice?.sublabel])}
                    onPress={() => setPicking(true)}
                  />
                ) : choice ? (
                  <Text variant="caption" color="textMuted">
                    {joinLabels([choice.label, choice.sublabel])}
                  </Text>
                ) : null}
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
                    برای نمودار دو مقدار با نمونه، روش، واحد و محدودهٔ هماهنگ لازم است.
                  </Text>
                )}
                {legend ? (
                  <Text variant="tiny" color="textFaint" style={{ marginTop: spacing.xs }}>
                    {legend}
                  </Text>
                ) : null}
                {excluded > 0 ? (
                  <Text variant="tiny" color="warning" style={{ marginTop: spacing.xs }}>
                    {toPersianDigits(excluded)} مقدار از گروه‌های دیگر یا با اطلاعات ناکافی در فهرست پایین است.
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
                        <Column gap="xxs" style={{ flex: 1 }}>
                          <Text variant="caption" color="textMuted">
                            {formatJalaliDateTime(r.collectedAt)}
                          </Text>
                          <Text variant="tiny" color="textMuted">
                            {contextLabel(r)}
                          </Text>
                        </Column>
                        <Row gap="xs">
                          <Text numeric style={{ color }}>
                            {ltrIsolate(r.value.value)}
                          </Text>
                          <Text variant="caption" color="textMuted" ltr>
                            {r.value.unit?.trim() || 'بدون واحد'}
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
        <PickerModal
          visible={picking && choices.length > 1}
          title="گروه نمودار"
          selectedId={choice?.id}
          items={choices}
          onClose={() => setPicking(false)}
          onSelect={(item) => {
            setSelected(item.id);
            setPicking(false);
          }}
        />
      </Screen>
    </>
  );
}

function contextLabel(row: {
  panelName: string | null;
  specimen: string | null;
  method: string | null;
  labName: string | null;
}) {
  return joinLabels([row.panelName, row.specimen, row.method, row.labName]) || 'نوع نمونه ثبت نشده';
}
