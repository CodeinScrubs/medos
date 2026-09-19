import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/theme';

export type TrendPoint = {
  at: Date;
  value: number;
  flag?: 'high' | 'low' | 'normal' | 'critical_high' | 'critical_low' | null;
};

const PAD = { top: 16, right: 16, bottom: 28, left: 44 };

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step = 10 ** Math.floor(Math.log10(span / count));
  const err = (count * step) / span;
  const mult = err <= 0.15 ? 10 : err <= 0.35 ? 5 : err <= 0.75 ? 2 : 1;
  const nice = step * mult;
  const start = Math.ceil(min / nice) * nice;
  const ticks: number[] = [];
  for (let v = start; v <= max + nice * 1e-9; v += nice) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

function formatTick(v: number): string {
  if (Math.abs(v) >= 100) return String(Math.round(v));
  if (Math.abs(v) >= 10) return String(Number(v.toFixed(1)));
  return String(Number(v.toFixed(2)));
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

  const values = points.map((p) => p.value);
  const lo = Math.min(...values, refLow ?? Infinity);
  const hi = Math.max(...values, refHigh ?? -Infinity);
  const margin = (hi - lo || Math.abs(hi) || 1) * 0.12;
  const yMin = lo - margin;
  const yMax = hi + margin;

  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const plotH = height - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const ticks = niceTicks(yMin, yMax);

  // Label at most ~5 dates so they never collide on a narrow phone.
  const labelEvery = Math.max(1, Math.ceil(points.length / 5));

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

          {points.map((p, i) => (
            <Circle
              key={`p${i}`}
              cx={x(i)}
              cy={y(p.value)}
              r={4.5}
              fill={pointColor(p.flag)}
              stroke={colors.surface}
              strokeWidth={2}
            />
          ))}

          {points.map((p, i) =>
            i % labelEvery === 0 || i === points.length - 1 ? (
              <SvgText
                key={`d${i}`}
                x={x(i)}
                y={height - 8}
                fontSize={10}
                fontFamily={typography.tiny.fontFamily}
                fill={colors.textFaint}
                textAnchor="middle"
              >
                {formatDate(p.at)}
              </SvgText>
            ) : null,
          )}
        </Svg>
      )}
    </View>
  );
}
