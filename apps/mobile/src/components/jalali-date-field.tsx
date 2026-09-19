import { useState } from 'react';

import { Input, Text } from '@/components/ui';
import { formatJalaliLong, fromIsoDate, parseJalaliInput, toIsoDate, toJalali } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';

/**
 * A Jalali date typed as free text rather than picked from a calendar.
 *
 * On a ward, "۱۳۶۸/۴/۲" is three seconds of typing; scrolling a date wheel
 * back fifty years is not. The field accepts any separator, folds Persian
 * digits, expands two-digit years, and echoes back what it understood so a
 * wrong parse is visible before saving.
 */
export function JalaliDateField({
  label,
  value,
  onChange,
  hint,
  required,
  allowFuture = false,
}: {
  label: string;
  /** Gregorian ISO `YYYY-MM-DD`, or null. */
  value: string | null;
  onChange: (iso: string | null) => void;
  hint?: string;
  required?: boolean;
  /** Birth dates cannot be in the future; follow-up dates usually are. */
  allowFuture?: boolean;
}) {
  const [text, setText] = useState(() => isoToJalaliText(value));
  const [error, setError] = useState<string | undefined>();

  // Keep the field in step when the value is replaced from outside — but not
  // when the change came from this field's own typing. Without that check,
  // typing "1403/05/1" on the way to "1403/05/12" parses as day 1, and the
  // text gets rewritten to the padded form under the user's cursor. (State is
  // adjusted during render, React's pattern for state derived from a prop.)
  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    const parsed = parseJalaliInput(text);
    if ((parsed ? toIsoDate(parsed) : null) !== value) setText(isoToJalaliText(value));
  }

  function handleChange(next: string) {
    setText(next);
    const trimmed = next.trim();

    if (!trimmed) {
      setError(undefined);
      onChange(null);
      return;
    }

    const parsed = parseJalaliInput(trimmed);
    if (!parsed) {
      // Not an error yet: the user is probably mid-way through typing.
      setError(undefined);
      return;
    }
    if (!allowFuture && parsed.getTime() > Date.now()) {
      setError('تاریخ در آینده است');
      return;
    }
    setError(undefined);
    onChange(toIsoDate(parsed));
  }

  const preview = value ? formatJalaliLong(value) : null;

  return (
    <>
      <Input
        label={label}
        value={text}
        onChangeText={handleChange}
        onBlur={() => {
          if (text.trim() && !parseJalaliInput(text)) setError('تاریخ معتبر نیست');
        }}
        placeholder={toPersianDigits('1370/05/12')}
        keyboardType="numbers-and-punctuation"
        numericFold
        error={error}
        hint={!error && !preview ? hint : undefined}
        required={required}
        icon="calendar-outline"
      />
      {preview && !error ? (
        <Text variant="tiny" color="success">
          {preview}
        </Text>
      ) : null}
    </>
  );
}

function isoToJalaliText(iso: string | null): string {
  const d = fromIsoDate(iso);
  if (!d) return '';
  const { jy, jm, jd } = toJalali(d);
  return toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
}
