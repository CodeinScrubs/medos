import { useEffect, useState } from 'react';

import { Input, Text } from '@/components/ui';
import { validateDateInput } from '@/lib/date-input';
import { formatJalaliLong, fromIsoDate, parseJalaliInput, toIsoDate, toJalali } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';

import { useNow } from './use-now';

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
  onValidityChange,
  hint,
  required,
  allowFuture = false,
}: {
  label: string;
  /** Gregorian ISO `YYYY-MM-DD`, or null. */
  value: string | null;
  onChange: (iso: string | null) => void;
  onValidityChange: (valid: boolean) => void;
  hint?: string;
  required?: boolean;
  /** Birth dates cannot be in the future; follow-up dates usually are. */
  allowFuture?: boolean;
}) {
  const [text, setText] = useState(() => isoToJalaliText(value));
  const [blurred, setBlurred] = useState(false);
  const now = useNow();
  const result = validateDateInput(text, { required: !!required, allowFuture, now: new Date(now) });
  const valid = result.valid;
  useEffect(() => {
    onValidityChange(valid);
  }, [valid, onValidityChange]);
  const error =
    !result.valid && (blurred || result.reason === 'future')
      ? { required: 'تاریخ لازم است', invalid: 'تاریخ معتبر نیست', future: 'تاریخ در آینده است' }[result.reason]
      : undefined;

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
    setBlurred(false);
    const nextResult = validateDateInput(next, { required: !!required, allowFuture, now: new Date(now) });
    onValidityChange(nextResult.valid);
    if (nextResult.valid) onChange(nextResult.iso);
  }

  const preview = result.valid && result.iso ? formatJalaliLong(result.iso) : null;

  return (
    <>
      <Input
        label={label}
        value={text}
        onChangeText={handleChange}
        onBlur={() => setBlurred(true)}
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
