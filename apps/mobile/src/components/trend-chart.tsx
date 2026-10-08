import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { chartDateIndices } from '@/lib/chart-dates';
import { useTheme } from '@/theme';

import { Text } from './ui/text';

export type TrendPoint = {
  at: Date;
  value: number;
  flag?: 'high' | 'low' | 'normal' | 'critical_high' | 'critical_low' | null;
  /**
   * The result was reported as a bound, not a number: `>100` is drawn at 100
   * with a triangle, because the true value is somewhere above it. Plotting it
   * as the plain number puts a ">1000 mg/L" next to a 90 and makes it look
   * like the same measurement.
   */
  bound?: 'above' | 'below' | null;
  /** No unit was recorded; the series' unit is an assumption, drawn hollow. */
  assumedUnit?: boolean;
};

const PAD = { top: 16, right: 16, bottom: 28, left: 44 };

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step = 10 ** Math.floor(Math.log10(span / count));
  const err = (count * step) / span;
  const mult = err <= 0.15 ? 10 : err <= 0.35 ? 5 : err <= 0.75 ? 2 : 1;
  const nice = step * mult;
  if (!Number.isFinite(nice) || nice <= 0) return [min, max];
  const start = Math.ceil(min / nice) * nice;
  const ticks: number[] = [];
  let previous = -Infinity;
  // A small step can be below the floating-point spacing of a large value.
  // Never run an additive loop that can stop advancing on the JS thread.
  for (let i = 0; i <= count * 2 + 2; i++) {
    const v = start + i * nice;
    if (!Number.isFinite(v) || v > max + nice * 1e-9 || v <= previous) break;
    const tick = Number(v.toPrecision(12));
    if (ticks.at(-1) !== tick) ticks.push(tick);
    previous = v;
  }
  return ticks;
}

function formatTick(v: number): string {
  return String(v);
}

/**
 * One analyte over time.
 *
 * The chart is laid out left-to-right (oldest to newest) even inside the RTL
 * app: time series read that way in every lab report and textbook, and flipping
 * it would make a rising creatinine look like it is falling.
 *
 * Points are spaced by draw order rather than by real time, so four draws on
 * day one and one a week later stay readable instead of piling up in a corner.
 */
export function TrendChart({
  points,
  refLow,
  refHigh,
  height = 220,
  formatDate,
}: {
  points: TrendPoint[];
  refLow?: number | null;
  refHigh?: number | null;
  height?: number;
  formatDate: (d: Date) => string;
}) {
  const { colors, typography } = useTheme();
  const [width, setWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (points.length === 0) return <View style={{ height }} onLayout={onLayout} />;

  const unavailable = (
    <View style={{ height }} onLayout={onLayout}>
      <Text variant="caption" color="textMuted">
        این مقادیر قابل رسم نیستند.
      </Text>
    </View>
  );
  if (
    points.some((p) => !Number.isFinite(p.value) || !(p.at instanceof Date) || !Number.isFinite(p.at.getTime())) ||
    (refLow != null && !Number.isFinite(refLow)) ||
    (refHigh != null && !Number.isFinite(refHigh))
  )
    return unavailable;
  const lo = points.reduce((value, p) => Math.min(value, p.value), refLow ?? Infinity);
  const hi = points.reduce((value, p) => Math.max(value, p.value), refHigh ?? -Infinity);
  const margin = (hi - lo || Math.abs(hi) || 1) * 0.12;
  const yMin = lo - margin;
  const yMax = hi + margin;
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || !Number.isFinite(yMax - yMin) || yMax <= yMin)
    return unavailable;

  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const plotH = height - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const ticks = niceTicks(yMin, yMax);

  // Budget for the actual date format: vitals include the year; labs use
  // shorter month/day labels. Native glyph layout still needs visual review.
  const dateLabels = points.map((p) => formatDate(p.at));
  const labelWidth = Math.max(...dateLabels.map((label) => Array.from(label).length), 1) * 6.5;
  const dateIndices = width >= labelWidth + PAD.right ? chartDateIndices(points.length, plotW, labelWidth) : [];

  const pointColor = (flag: TrendPoint['flag']) =>
    flag === 'high' || flag === 'critical_high'
      ? colors.warning
      : flag === 'low' || flag === 'critical_low'
        ? colors.info
        : colors.primary;

  return (
    <View style={{ height, direction: 'ltr' }} onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {refLow != null && refHigh != null && (
            <Rect
              x={PAD.left}
              y={y(refHigh)}
              width={plotW}
              height={Math.max(y(refLow) - y(refHigh), 0)}
              fill={colors.successSoft}
            />
          )}

          {ticks.map((t) => (
            <Line
              key={`g${t}`}
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={y(t)}
              y2={y(t)}
              stroke={colors.divider}
              strokeWidth={1}
            />
          ))}
          {ticks.map((t) => (
            <SvgText key={`t${t}`} x={PAD.left - 6} y={y(t) + 4} fontSize={10} fill={colors.textFaint} textAnchor="end">
              {formatTick(t)}
            </SvgText>
          ))}

          <Path d={path} stroke={colors.primary} strokeWidth={2} fill="none" />

          {/*
           * One marker per point, never two: a chart with arrows and rings
           * stacked on the same dot stops being readable at a glance, which is
           * the only thing a trend is for. The shape carries the meaning —
           * round is a measured value, a triangle pointing away from the axis
           * is a bound — and hollow means the unit was assumed.
           */}
          {points.map((p, i) => {
            const tone = pointColor(p.flag);
            const cx = x(i);
            const cy = y(p.value);
            const fill = p.assumedUnit ? colors.surface : tone;
            const stroke = p.assumedUnit ? tone : colors.surface;
            if (p.bound) {
              const dir = p.bound === 'above' ? -1 : 1;
              return (
                <Path
                  key={`p${i}`}
                  d={`M${cx - 5},${cy - dir * 3} L${cx + 5},${cy - dir * 3} L${cx},${cy + dir * 6} Z`}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={1.5}
                />
              );
            }
            return <Circle key={`p${i}`} cx={cx} cy={cy} r={4.5} fill={fill} stroke={stroke} strokeWidth={2} />;
          })}

          {dateIndices.map((i) => (
            <SvgText
              key={`d${i}`}
              x={x(i)}
              y={height - 8}
              fontSize={10}
              fontFamily={typography.tiny.fontFamily}
              fill={colors.textFaint}
              textAnchor={
                points.length === 1 ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'
              }
            >
              {dateLabels[i]}
            </SvgText>
          ))}
        </Svg>
      )}
    </View>
  );
}
