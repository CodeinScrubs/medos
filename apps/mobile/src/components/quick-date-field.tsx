import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { ChipSelect, Column, Field, Input, Row, Text } from '@/components/ui';
import { validDateAndClock } from '@/lib/date-input';
import { formatJalaliWithWeekday, formatRelative, fromIsoDate, toIsoDate } from '@/lib/jalali';
import { addDays, formatClock, parseClock, sameDay, withClock } from '@/lib/time';

import { JalaliDateField } from './jalali-date-field';
import { useNow } from './use-now';

type Preset = { key: string; label: string; days: number };

const FUTURE_PRESETS: Preset[] = [
  { key: 'd0', label: 'امروز', days: 0 },
  { key: 'd1', label: 'فردا', days: 1 },
  { key: 'd3', label: '۳ روز', days: 3 },
  { key: 'w1', label: '۱ هفته', days: 7 },
  { key: 'w2', label: '۲ هفته', days: 14 },
  { key: 'm1', label: '۱ ماه', days: 30 },
  { key: 'm3', label: '۳ ماه', days: 90 },
];

const PAST_PRESETS: Preset[] = [
  { key: 'd0', label: 'امروز', days: 0 },
  { key: 'd-1', label: 'دیروز', days: -1 },
  { key: 'd-2', label: 'پریروز', days: -2 },
  { key: 'w-1', label: 'هفته‌ی پیش', days: -7 },
];

const CUSTOM = 'custom';

/**
 * Pick a day by tapping an offset ("۱ هفته") rather than a calendar.
 *
 * Follow-ups are almost always "in a week" or "in a month", and events are
 * almost always "today" or "yesterday"; the free Jalali field is there for
 * everything else. Time is optional and defaults to the value's own clock.
 */
export function QuickDateField({
  label,
  value,
  onChange,
  onValidityChange,
  direction = 'future',
  withTime = false,
}: {
  label: string;
  value: Date;
  onChange: (next: Date) => void;
  onValidityChange: (valid: boolean) => void;
  direction?: 'future' | 'past';
  withTime?: boolean;
}) {
  const presets = direction === 'future' ? FUTURE_PRESETS : PAST_PRESETS;
  const now = useNow();
  const today = new Date(now);

  const matched = presets.find((p) => sameDay(addDays(today, p.days), value));
  const [customOpen, setCustomOpen] = useState(!matched);
  const [dayValid, setDayValid] = useState(true);
  const dayValidity = useRef(true);
  const [clockText, setClockText] = useState(formatClock(value));
  const latestClock = useRef(clockText);
  const [clockError, setClockError] = useState<string | undefined>();
  const formattedClock = formatClock(value);
  const [seenClock, setSeenClock] = useState(formattedClock);
  if (formattedClock !== seenClock) {
    setSeenClock(formattedClock);
    const parsed = parseClock(clockText);
    if (!parsed || parsed[0] !== value.getHours() || parsed[1] !== value.getMinutes()) {
      setClockText(formattedClock);
      setClockError(undefined);
    }
  }
  useLayoutEffect(() => {
    latestClock.current = clockText;
  }, [clockText]);
  const valid = Number.isFinite(value.getTime()) && validDateAndClock(!customOpen || dayValid, withTime, clockText);
  useEffect(() => {
    onValidityChange(valid);
  }, [valid, onValidityChange]);
  const reportDayValidity = useCallback(
    (next: boolean) => {
      dayValidity.current = next;
      setDayValid(next);
      onValidityChange(validDateAndClock(next, withTime, latestClock.current));
    },
    [onValidityChange, withTime],
  );

  const selectedKey = customOpen ? CUSTOM : (matched?.key ?? CUSTOM);

  return (
    <Column gap="xs">
      <ChipSelect
        label={label}
        value={selectedKey}
        options={[...presets.map((p) => ({ value: p.key, label: p.label })), { value: CUSTOM, label: 'تاریخ دیگر' }]}
        onChange={(key) => {
          if (key === CUSTOM || key == null) {
            setCustomOpen(true);
            return;
          }
          setCustomOpen(false);
          setDayValid(true);
          dayValidity.current = true;
          onValidityChange(validDateAndClock(true, withTime, latestClock.current));
          const preset = presets.find((p) => p.key === key)!;
          onChange(withClock(addDays(today, preset.days), value));
        }}
      />

      {customOpen && (
        <JalaliDateField
          label="تاریخ"
          required
          value={toIsoDate(value)}
          allowFuture={direction === 'future'}
          onValidityChange={reportDayValidity}
          onChange={(iso) => {
            const day = fromIsoDate(iso);
            if (day) onChange(withClock(day, value));
          }}
        />
      )}

      <Row gap="sm" align="flex-start">
        <View style={{ flex: 1 }}>
          {valid ? (
            <Text variant="caption" color="primary">
              {formatJalaliWithWeekday(value)} — {formatRelative(value)}
            </Text>
          ) : null}
        </View>
        {withTime && (
          <View style={{ width: 110 }}>
            <Field>
              <Input
                value={clockText}
                onChangeText={(t) => {
                  setClockText(t);
                  latestClock.current = t;
                  const parsed = parseClock(t);
                  onValidityChange(validDateAndClock(!customOpen || dayValidity.current, withTime, t));
                  if (!parsed) {
                    setClockError(t.trim() ? 'مثلاً ۰۹:۳۰' : 'ساعت لازم است');
                    return;
                  }
                  setClockError(undefined);
                  const [h, m] = parsed;
                  onChange(new Date(value.getFullYear(), value.getMonth(), value.getDate(), h, m));
                }}
                onBlur={() => {
                  if (parseClock(latestClock.current)) {
                    latestClock.current = formatClock(value);
                    setClockText(latestClock.current);
                  }
                }}
                keyboardType="numbers-and-punctuation"
                icon="time-outline"
                error={clockError}
                ltr
              />
            </Field>
          </View>
        )}
      </Row>
    </Column>
  );
}
