import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { alertError } from '@/components/feedback';
import { Button, ChipSelect, Column, Input, Screen } from '@/components/ui';
import { addPatientContact } from '@/features/patients/queries';
import { normalizePhone } from '@/lib/persian';
import { useTheme } from '@/theme';

const RELATIONS = ['همسر', 'پسر', 'دختر', 'پدر', 'مادر', 'برادر', 'خواهر', 'نوه', 'همراه'];

/** Add a companion / next-of-kin number to a patient. */
export function ContactFormScreen() {
  const { id: patientId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { spacing } = useTheme();

  const [name, setName] = useState('');
  const [relation, setRelation] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const digits = normalizePhone(phone);
  const phoneError = phone.trim() && digits.length < 8 ? 'شماره کامل نیست' : undefined;

  async function save() {
    if (!digits) {
      Alert.alert('شماره لازم است');
      return;
    }
    setSaving(true);
    try {
      await addPatientContact(patientId, {
        name: name.trim() || undefined,
        relation: relation ?? undefined,
        phone: digits,
        notes: notes.trim() || undefined,
      });
      router.back();
    } catch (e) {
      alertError('ذخیره نشد', e);
    } finally {
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
          onChangeText={setPhone}
          keyboardType="phone-pad"
          numericFold
          ltr
          autoFocus
          error={phoneError}
        />
        <ChipSelect label="نسبت" options={RELATIONS} value={relation} onChange={setRelation} allowDeselect />
        <Input label="نام" value={name} onChangeText={setName} />
        <Input
          label="یادداشت"
          value={notes}
          onChangeText={setNotes}
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
        <Button label="انصراف" variant="ghost" onPress={() => router.back()} full haptic={false} />
      </Column>
    </Screen>
  );
}
