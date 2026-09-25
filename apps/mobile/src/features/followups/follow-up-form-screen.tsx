import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';

import { alertError, notify } from '@/components/feedback';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, ChipSelect, Column, Input, Screen, Segmented, Text } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import type { FollowUp } from '@/db/schema';
import { createFollowUp } from '@/features/followups/queries';
import { useTheme } from '@/theme';

import { FOLLOWUP_CHANNEL_LABELS, FOLLOWUP_PRIORITY_LABELS } from './labels';
import { defaultDueDate } from './logic';

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
  const router = useRouter();
  const { spacing } = useTheme();

  const [reason, setReason] = useState('');
  const [dueAt, setDueAt] = useState(() => defaultDueDate());
  const [channel, setChannel] = useState<FollowUp['channel']>('call');
  const [priority, setPriority] = useState<FollowUp['priority']>('normal');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const dateValidation = useDateValidation();

  async function save() {
    if (savingRef.current) return;
    if (!dateValidation.check()) return;
    if (!reason.trim()) {
      notify('دلیل پیگیری را بنویسید');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await createFollowUp({ patientId, reason, dueAt, channel, priority });
      router.back();
    } catch (e) {
      alertError('ذخیره نشد', e);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <Input
          label="برای چه؟"
          required
          value={reason}
          onChangeText={setReason}
          placeholder="مثلاً جواب بیوپسی"
          autoFocus
        />
        <ChipSelect
          options={COMMON_REASONS}
          value={COMMON_REASONS.includes(reason) ? reason : null}
          onChange={(v) => setReason(v ?? '')}
          allowDeselect
        />

        <QuickDateField
          onValidityChange={dateValidation.setValid}
          label="کِی؟"
          value={dueAt}
          onChange={setDueAt}
          direction="future"
          withTime
        />

        <ChipSelect label="چطور؟" options={CHANNEL_OPTIONS} value={channel} onChange={(v) => v && setChannel(v)} />

        <Segmented label="اهمیت" options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} />

        <Text variant="tiny" color="textFaint">
          برای دریافت یادآور، اجازهٔ اعلان لازم است. پیگیری در صفحهٔ «امروز» هم نمایش داده می‌شود.
        </Text>

        <Button
          label="ثبت پیگیری"
          icon="alarm-outline"
          onPress={() => void save()}
          loading={saving}
          full
          style={{ marginTop: spacing.sm }}
        />
        <Button label="انصراف" variant="ghost" onPress={() => router.back()} disabled={saving} full haptic={false} />
      </Column>
    </Screen>
  );
}
