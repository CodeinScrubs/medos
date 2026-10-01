import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';

import { ErrorNotice } from '@/components/error-notice';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, ChipSelect, Column, Input, Screen, Segmented, Text } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import { useNow } from '@/components/use-now';
import type { FollowUp } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { useTheme } from '@/theme';

import { followUpDisplayDate } from './form-draft';
import { FollowUpFormDraftNotice } from './form-draft-notice';
import { followUpFormQuery } from './form-draft-queries';
import { FOLLOWUP_CHANNEL_LABELS, FOLLOWUP_PRIORITY_LABELS } from './labels';
import { followUpFormSeed, useFollowUpFormDraft, type FollowUpFormSeed } from './use-form-draft';

const COMMON_REASONS = [
  'پیگیری جواب پاتولوژی',
  'کنترل آزمایش',
  'ویزیت مجدد',
  'پرسیدن حال عمومی',
  'پیگیری عوارض دارو',
  'پیگیری جواب تصویربرداری',
];

const CHANNEL_OPTIONS = (Object.keys(FOLLOWUP_CHANNEL_LABELS) as FollowUp['channel'][]).map((k) => ({
  value: k,
  label: FOLLOWUP_CHANNEL_LABELS[k],
}));

const PRIORITY_OPTIONS = (Object.keys(FOLLOWUP_PRIORITY_LABELS) as FollowUp['priority'][]).map((k) => ({
  value: k,
  label: FOLLOWUP_PRIORITY_LABELS[k],
}));

/** New follow-up for a patient. The reminder is scheduled on save. */
export function FollowUpFormScreen() {
  const { id: patientId } = useLocalSearchParams<{ id: string }>();
  return <DraftGate key={patientId} patientId={patientId} />;
}

function DraftGate({ patientId }: { patientId: string }) {
  const { data, error, retry } = useLive(followUpFormQuery(patientId), [patientId]);
  const now = useNow();
  const [seed, setSeed] = useState<{ value: FollowUpFormSeed; generation: number } | null>(null);
  let decodeError: Error | undefined;
  if (!seed && data?.[0]) {
    try {
      setSeed({ value: followUpFormSeed(data[0], new Date(now)), generation: 0 });
    } catch (e) {
      decodeError = e instanceof Error ? e : new Error('پیش‌نویس قابل خواندن نیست.');
    }
  }
  const missing =
    data && !data.length ? new Error('پروندهٔ بیمار در دسترس نیست؛ نوشتهٔ فعلی نگه داشته شد.') : undefined;
  const notice = <ErrorNotice error={error ?? decodeError ?? missing} what="پیش‌نویس پیگیری" onRetry={retry} />;
  if (!seed)
    return (
      <Screen>
        <Column>
          {notice}
          {!error && !decodeError && !missing ? <Text>بارگذاری پیش‌نویس…</Text> : null}
        </Column>
      </Screen>
    );
  return (
    <FollowUpFormEditor
      key={seed.generation}
      seed={seed.value}
      readNotice={notice}
      onReset={(value) => setSeed({ value, generation: seed.generation + 1 })}
    />
  );
}

function FollowUpFormEditor({
  seed,
  readNotice,
  onReset,
}: {
  seed: FollowUpFormSeed;
  readNotice: ReactNode;
  onReset: (seed: FollowUpFormSeed) => void;
}) {
  const { spacing } = useTheme();
  const now = useNow();
  const editing = useFollowUpFormDraft(seed, onReset);
  const { form, change, busy: saving } = editing;
  const dateValidation = useDateValidation();
  const locked = saving || !!editing.completedId;

  return (
    <Screen scroll>
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {readNotice}
        <Text variant="bodyStrong">
          {seed.row.patient.firstName} {seed.row.patient.lastName}
        </Text>
        <FollowUpFormDraftNotice editing={editing} seed={seed} />
        <Input
          label="برای چه؟"
          required
          value={form.reason}
          onChangeText={(reason) => change({ reason })}
          editable={!locked}
          placeholder="مثلاً جواب بیوپسی"
          autoFocus
        />
        <ChipSelect
          options={COMMON_REASONS}
          value={COMMON_REASONS.includes(form.reason) ? form.reason : null}
          onChange={(v) => change({ reason: v ?? '' })}
          allowDeselect
        />

        <QuickDateField
          onValidityChange={dateValidation.setValid}
          label="کِی؟"
          value={followUpDisplayDate(editing.document, new Date(now))}
          rawInput={form.date}
          onRawInputChange={editing.changeDate}
          disabled={locked}
          direction="future"
          withTime
        />

        <ChipSelect
          label="چطور؟"
          options={CHANNEL_OPTIONS}
          value={form.channel}
          onChange={(v) => v && change({ channel: v })}
        />

        <Segmented
          label="اهمیت"
          options={PRIORITY_OPTIONS}
          value={form.priority}
          onChange={(priority) => change({ priority })}
          disabled={locked}
        />

        <Button
          label="ثبت پیگیری"
          icon="alarm-outline"
          onPress={() => {
            if (dateValidation.check()) void editing.save();
          }}
          loading={saving}
          full
          style={{ marginTop: spacing.sm }}
        />
        <Button label="بستن" variant="ghost" onPress={editing.close} disabled={saving} full haptic={false} />
        {editing.hasDraft && !editing.completedId ? (
          <Button
            label="حذف پیش‌نویس"
            variant="ghost"
            onPress={editing.discard}
            disabled={saving}
            full
            haptic={false}
          />
        ) : null}
      </Column>
    </Screen>
  );
}
