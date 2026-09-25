import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { alertError } from '@/components/feedback';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Card, ChipSelect, Column, Input, Row, Screen, Text } from '@/components/ui';
import { RATING_AXES } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { RATING_STEP_LABELS } from './labels';
import { doctorDisplayName, ratingAverage, type RatingScores } from './logic';
import { doctorQuery } from './queries';
import { addDoctorRating } from './ratings-queries';

const STEPS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: toPersianDigits(n) }));

/**
 * A new private rating of a colleague.
 *
 * Every rating is added rather than edited: the point of keeping them is to
 * see that an opinion formed in the first month changed after a year. Axes
 * left blank stay blank — "no opinion yet" is a real answer and must not be
 * recorded as a low score.
 *
 * These notes are about named people and are never shared or exported.
 */
export function RatingScreen() {
  const { doctorId } = useLocalSearchParams<{ doctorId: string }>();
  const router = useRouter();
  const { spacing } = useTheme();

  const { data } = useLive(doctorQuery(doctorId ?? ''), [doctorId]);
  const doctor = data?.[0];

  const [scores, setScores] = useState<RatingScores>({});
  const [reasoning, setReasoning] = useState('');
  const [saving, setSaving] = useState(false);

  const average = ratingAverage(scores);

  async function save() {
    if (Object.values(scores).every((v) => v == null) && !reasoning.trim()) {
      Alert.alert('چیزی ثبت نشده', 'حداقل یک معیار را امتیاز بدهید یا دلیلی بنویسید.');
      return;
    }
    setSaving(true);
    try {
      await addDoctorRating(doctorId, { ...scores, reasoning });
      router.back();
    } catch (e) {
      alertError('ثبت نشد', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: 'امتیاز جدید' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {doctor ? <Text variant="subheading">{doctorDisplayName(doctor)}</Text> : null}
        <Text variant="tiny" color="textFaint">
          یادداشت شخصی خودتان است؛ هیچ‌جا نمایش داده یا فرستاده نمی‌شود. هر معیاری که نظری درباره‌اش ندارید را خالی
          بگذارید.
        </Text>

        {RATING_AXES.map((axis) => (
          <AxisRow
            key={axis.key}
            label={axis.labelFa}
            value={scores[axis.key] ?? null}
            onChange={(v) => setScores((s) => ({ ...s, [axis.key]: v }))}
          />
        ))}

        <Card tone="alt">
          <Row justify="space-between">
            <Text variant="bodyStrong">میانگین این امتیاز</Text>
            <Text variant="bodyStrong" color={average == null ? 'textFaint' : 'primary'}>
              {average == null ? '—' : `${toPersianDigits(average)} از ۵`}
            </Text>
          </Row>
        </Card>

        <Input
          label="دلیل و توضیح"
          value={reasoning}
          onChangeText={setReasoning}
          multiline
          placeholder="چه چیزی این نظر را ساخت؟ یک مثال مشخص بعداً خیلی بیشتر از یک عدد کمک می‌کند."
        />

        <Button label="ثبت امتیاز" icon="checkmark" onPress={() => void save()} loading={saving} full />
        <Button label="انصراف" variant="ghost" onPress={() => router.back()} full haptic={false} />
      </Column>
    </Screen>
  );
}

function AxisRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <ChipSelect
      label={label}
      options={STEPS}
      value={value == null ? null : String(value)}
      onChange={(v) => onChange(v == null ? null : Number(v))}
      allowDeselect
      layout="wrap"
      hint={value == null ? 'بدون نظر' : RATING_STEP_LABELS[value]}
    />
  );
}
