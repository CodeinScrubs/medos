import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';

import { useDatasetIntent } from '@/components/dataset-intent';
import { alertError, notify } from '@/components/feedback';
import { Button, ChipSelect, Column, Input, Screen } from '@/components/ui';
import { addPatientContact } from '@/features/patients/queries';
import { withDatasetWrite } from '@/lib/dataset-write';
import { normalizePhone } from '@/lib/persian';
import { useTheme } from '@/theme';

const RELATIONS = ['همسر', 'پسر', 'دختر', 'پدر', 'مادر', 'برادر', 'خواهر', 'نوه', 'همراه'];

/** Add a companion / next-of-kin number to a patient. */
export function ContactFormScreen() {
  const { generation } = useDatasetIntent();
  const { id: patientId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { spacing } = useTheme();

  const [fields, setFields] = useState({ name: '', relation: null as string | null, phone: '', notes: '' });
  const latest = useRef(fields);
  const { name, relation, phone, notes } = fields;
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  const digits = normalizePhone(phone);
  const phoneError = phone.trim() && digits.length < 8 ? 'شماره کامل نیست' : undefined;

  function change<K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) {
    if (savingRef.current) return;
    const next = { ...latest.current, [key]: value };
    latest.current = next;
    setFields(next);
  }
  async function save() {
    if (savingRef.current) return;
    const current = latest.current;
    const currentDigits = normalizePhone(current.phone);
    if (!currentDigits) {
      notify('شماره لازم است');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await withDatasetWrite(generation, async () => {
        await addPatientContact(patientId, {
          name: current.name.trim() || undefined,
          relation: current.relation ?? undefined,
          phone: currentDigits,
          notes: current.notes.trim() || undefined,
        });
        router.back();
      });
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
          label="شماره تماس"
          required
          value={phone}
          onChangeText={(value) => change('phone', value)}
          editable={!saving}
          keyboardType="phone-pad"
          numericFold
          ltr
          autoFocus
          error={phoneError}
        />
        <ChipSelect
          label="نسبت"
          options={RELATIONS}
          value={relation}
          onChange={(value) => change('relation', value)}
          allowDeselect
        />
        <Input label="نام" value={name} onChangeText={(value) => change('name', value)} editable={!saving} />
        <Input
          label="یادداشت"
          value={notes}
          onChangeText={(value) => change('notes', value)}
          editable={!saving}
          placeholder="مثلاً فقط بعد از ساعت ۵ جواب می‌دهد"
        />

        <Button
          label="ذخیره"
          icon="checkmark"
          onPress={() => void save()}
          loading={saving}
          full
          style={{ marginTop: spacing.sm }}
        />
        <Button
          label="انصراف"
          variant="ghost"
          onPress={() => {
            if (!savingRef.current) router.back();
          }}
          disabled={saving}
          full
          haptic={false}
        />
      </Column>
    </Screen>
  );
}
