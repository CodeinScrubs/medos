import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';

import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { notify } from '@/components/feedback';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Card, ChipSelect, Column, Input, Row, Screen, Text } from '@/components/ui';
import { RATING_AXES, type Doctor } from '@/db/schema';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { RATING_STEP_LABELS } from './labels';
import { doctorDisplayName, ratingAverage, type RatingScores } from './logic';
import { ManualDoctorGate, useManualDoctorForm } from './manual-form';
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
  const parent = useAutosaveScope();
  const form = (
    <ManualDoctorGate key={doctorId} query={doctorQuery(doctorId ?? '')} what="پزشک">
      {(doctor, notice, generation, unavailable) =>
        doctor ? (
          <RatingForm doctor={doctor} readNotice={notice} generation={generation} unavailable={unavailable} />
        ) : null
      }
    </ManualDoctorGate>
  );
  return parent ? form : <AutosaveScope key={doctorId}>{form}</AutosaveScope>;
}

function RatingForm({
  doctor,
  readNotice,
  generation,
  unavailable,
}: {
  doctor: Doctor;
  readNotice: ReactNode;
  generation: number;
  unavailable: boolean;
}) {
  const { spacing } = useTheme();
  const editing = useManualDoctorForm({ scores: {} as RatingScores, reasoning: '' }, generation, unavailable);
  const { scores, reasoning } = editing.fields;
  const { busy: saving, locked } = editing;

  const average = ratingAverage(scores);

  async function save() {
    await editing.submit(async ({ scores, reasoning }) => {
      if (Object.values(scores).every((v) => v == null) && !reasoning.trim()) {
        notify('چیزی ثبت نشده', 'حداقل یک معیار را امتیاز بدهید یا دلیلی بنویسید.');
        return false;
      }
      await addDoctorRating(doctor.id, { ...scores, reasoning });
      return true;
    });
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: 'امتیاز جدید' }} />
      <Column collapsable={false} gap="md" style={{ paddingTop: spacing.md }}>
        {readNotice}
        {editing.completed ? <Text>ذخیره شد؛ برای برگشت، «بستن» را بزنید.</Text> : null}
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
            disabled={locked}
            onChange={(v) => editing.change((current) => ({ scores: { ...current.scores, [axis.key]: v } }))}
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
          editable={!locked}
          onChangeText={(reasoning) => editing.change({ reasoning })}
          multiline
          placeholder="چه چیزی این نظر را ساخت؟ یک مثال مشخص بعداً خیلی بیشتر از یک عدد کمک می‌کند."
        />

        <Button
          label={editing.completed ? 'بستن' : 'ثبت امتیاز'}
          icon="checkmark"
          onPress={() => {
            if (editing.completed) editing.close();
            else void save();
          }}
          disabled={locked && !editing.completed}
          loading={saving}
          full
        />
        {!editing.completed ? (
          <Button label="انصراف" variant="ghost" onPress={editing.close} disabled={saving} full haptic={false} />
        ) : null}
      </Column>
    </Screen>
  );
}

function AxisRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled: boolean;
}) {
  return (
    <ChipSelect
      disabled={disabled}
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
