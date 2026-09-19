import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { CollapsibleSection } from '@/components/collapsible-section';
import { alertError } from '@/components/feedback';
import { JalaliDateField } from '@/components/jalali-date-field';
import { Button, Column, Input, Row, Screen, Segmented, Text } from '@/components/ui';
import type { Patient, PatientStatus } from '@/db/schema';
import { isValidNationalId, toLatinDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { BLOOD_TYPES, PATIENT_STATUS, PATIENT_STATUS_ORDER, SEX_LABELS } from './labels';
import { createPatient, findPossibleDuplicates, updatePatient, type PatientInput } from './queries';

type FormState = {
  firstName: string;
  lastName: string;
  sex: 'male' | 'female' | 'other' | null;
  birthDate: string | null;
  ageYears: string;
  status: PatientStatus;
  summary: string;
  nationalId: string;
  fileNumber: string;
  phone: string;
  city: string;
  address: string;
  bloodType: string;
  allergies: string;
  pastMedicalHistory: string;
  drugHistory: string;
  habitualHistory: string;
  familyHistory: string;
};

function initialState(patient?: Patient): FormState {
  return {
    firstName: patient?.firstName ?? '',
    lastName: patient?.lastName ?? '',
    sex: patient?.sex ?? null,
    birthDate: patient?.birthDate ?? null,
    ageYears: patient?.ageYears != null ? String(patient.ageYears) : '',
    status: patient?.status ?? 'admitted',
    summary: patient?.summary ?? '',
    nationalId: patient?.nationalId ?? '',
    fileNumber: patient?.fileNumber ?? '',
    phone: patient?.phone ?? '',
    city: patient?.city ?? '',
    address: patient?.address ?? '',
    bloodType: patient?.bloodType ?? '',
    allergies: patient?.allergies ?? '',
    pastMedicalHistory: patient?.pastMedicalHistory ?? '',
    drugHistory: patient?.drugHistory ?? '',
    habitualHistory: patient?.habitualHistory ?? '',
    familyHistory: patient?.familyHistory ?? '',
  };
}

/**
 * Create and edit form for a patient.
 *
 * Only the first and last name are required. Everything else is optional and
 * folded into sections, because a patient often has to be entered in the
 * thirty seconds between being told about them and walking into the room.
 */
export function PatientForm({ patient }: { patient?: Patient }) {
  const router = useRouter();
  const { spacing } = useTheme();
  const isEdit = Boolean(patient);

  const [form, setForm] = useState<FormState>(() => initialState(patient));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.firstName.trim()) next.firstName = 'نام لازم است';
    if (!form.lastName.trim()) next.lastName = 'نام خانوادگی لازم است';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function toInput(): PatientInput {
    const age = toLatinDigits(form.ageYears).replace(/\D/g, '');
    return {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      sex: form.sex,
      birthDate: form.birthDate,
      ageYears: age ? Number(age) : null,
      status: form.status,
      summary: form.summary.trim() || null,
      nationalId: toLatinDigits(form.nationalId).replace(/\D/g, '') || null,
      fileNumber: form.fileNumber.trim() || null,
      phone: form.phone.trim() || null,
      city: form.city.trim() || null,
      address: form.address.trim() || null,
      bloodType: form.bloodType || null,
      allergies: form.allergies.trim() || null,
      pastMedicalHistory: form.pastMedicalHistory.trim() || null,
      drugHistory: form.drugHistory.trim() || null,
      habitualHistory: form.habitualHistory.trim() || null,
      familyHistory: form.familyHistory.trim() || null,
      starred: patient?.starred ?? false,
      tags: patient?.tags ?? null,
    };
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEdit && patient) {
        await updatePatient(patient.id, toInput());
        router.back();
        return;
      }

      const duplicates = await findPossibleDuplicates(
        form.firstName.trim(),
        form.lastName.trim(),
        toLatinDigits(form.nationalId).replace(/\D/g, '') || null,
      );

      if (duplicates.length > 0) {
        const names = duplicates.map((d) => `• ${d.firstName} ${d.lastName}`).join('\n');
        Alert.alert('بیمار مشابه پیدا شد', `این بیماران از قبل ثبت شده‌اند:\n${names}\n\nباز هم بیمار جدید ثبت شود؟`, [
          { text: 'انصراف', style: 'cancel', onPress: () => setSaving(false) },
          {
            text: 'ثبت کن',
            onPress: () => {
              void commitNew();
            },
          },
        ]);
        return;
      }

      await commitNew();
    } catch (e) {
      setSaving(false);
      alertError('ثبت نشد', e);
    }
  }

  async function commitNew() {
    try {
      const id = await createPatient(toInput());
      router.replace({ pathname: '/patient/[id]', params: { id } });
    } catch (e) {
      alertError('ثبت نشد', e);
    } finally {
      setSaving(false);
    }
  }

  const nationalIdDigits = toLatinDigits(form.nationalId).replace(/\D/g, '');
  const nationalIdWarning =
    nationalIdDigits.length === 10 && !isValidNationalId(nationalIdDigits)
      ? 'کد ملی با این ارقام معتبر نیست — اگر مطمئنید، رد کنید'
      : undefined;

  return (
    <Screen scroll>
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <Row gap="md">
          <View style={{ flex: 1 }}>
            <Input
              label="نام"
              required
              value={form.firstName}
              onChangeText={(v) => set('firstName', v)}
              error={errors.firstName}
              autoFocus={!isEdit}
              returnKeyType="next"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="نام خانوادگی"
              required
              value={form.lastName}
              onChangeText={(v) => set('lastName', v)}
              error={errors.lastName}
              returnKeyType="next"
            />
          </View>
        </Row>

        <Segmented
          label="جنسیت"
          value={form.sex}
          onChange={(v) => set('sex', v)}
          options={[
            { value: 'male', label: SEX_LABELS.male },
            { value: 'female', label: SEX_LABELS.female },
            { value: 'other', label: SEX_LABELS.other },
          ]}
        />

        <Row gap="md" align="flex-start">
          <View style={{ flex: 1.4 }}>
            <JalaliDateField
              label="تاریخ تولد"
              value={form.birthDate}
              onChange={(iso) => set('birthDate', iso)}
              hint="اگر نمی‌دانید، فقط سن را بنویسید"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="سن"
              value={form.ageYears}
              onChangeText={(v) => set('ageYears', v)}
              keyboardType="number-pad"
              numericFold
              placeholder="سال"
            />
          </View>
        </Row>

        <Segmented
          label="وضعیت"
          value={form.status}
          onChange={(v) => set('status', v)}
          options={PATIENT_STATUS_ORDER.slice(0, 3).map((s) => ({
            value: s,
            label: PATIENT_STATUS[s].label,
          }))}
        />

        <Input
          label="خلاصه‌ی یک‌خطی"
          value={form.summary}
          onChangeText={(v) => set('summary', v)}
          placeholder="مثلاً: آقای ۶۲ ساله، DM، با درد شکم"
          hint="این خط در لیست بیماران دیده می‌شود و کمک می‌کند سریع یادتان بیاید"
        />

        <CollapsibleSection
          title="شناسه و تماس"
          icon="call-outline"
          subtitle="کد ملی، شماره پرونده، تلفن، آدرس"
          filledCount={[form.nationalId, form.fileNumber, form.phone, form.city, form.address].filter(Boolean).length}
        >
          <Input
            label="کد ملی"
            value={form.nationalId}
            onChangeText={(v) => set('nationalId', v)}
            keyboardType="number-pad"
            numericFold
            ltr
            hint={nationalIdWarning}
          />
          <Input label="شماره پرونده" value={form.fileNumber} onChangeText={(v) => set('fileNumber', v)} ltr />
          <Input
            label="شماره تماس بیمار"
            value={form.phone}
            onChangeText={(v) => set('phone', v)}
            keyboardType="phone-pad"
            numericFold
            ltr
          />
          <Input label="شهر" value={form.city} onChangeText={(v) => set('city', v)} />
          <Input label="آدرس" value={form.address} onChangeText={(v) => set('address', v)} multiline />
          <Text variant="tiny" color="textFaint">
            شماره‌ی همراهان بیمار را بعد از ثبت، از داخل پرونده اضافه کنید.
          </Text>
        </CollapsibleSection>

        <CollapsibleSection
          title="سابقه"
          icon="document-text-outline"
          subtitle="آلرژی، PMH، داروها، عادات، سابقه خانوادگی"
          filledCount={
            [
              form.allergies,
              form.pastMedicalHistory,
              form.drugHistory,
              form.habitualHistory,
              form.familyHistory,
              form.bloodType,
            ].filter(Boolean).length
          }
        >
          <Input
            label="آلرژی"
            value={form.allergies}
            onChangeText={(v) => set('allergies', v)}
            placeholder="NKDA"
            hint="اگر آلرژی ندارد، NKDA بنویسید تا بعداً معلوم باشد پرسیده‌اید"
          />
          <Input
            label="گروه خونی"
            value={form.bloodType}
            onChangeText={(v) => set('bloodType', v.toUpperCase())}
            ltr
            placeholder={BLOOD_TYPES.join(' / ')}
            autoCapitalize="characters"
          />
          <Input
            label="سابقه بیماری (PMH)"
            value={form.pastMedicalHistory}
            onChangeText={(v) => set('pastMedicalHistory', v)}
            multiline
          />
          <Input label="سابقه دارویی" value={form.drugHistory} onChangeText={(v) => set('drugHistory', v)} multiline />
          <Input
            label="عادات (سیگار، تریاک، الکل)"
            value={form.habitualHistory}
            onChangeText={(v) => set('habitualHistory', v)}
            multiline
          />
          <Input
            label="سابقه خانوادگی"
            value={form.familyHistory}
            onChangeText={(v) => set('familyHistory', v)}
            multiline
          />
        </CollapsibleSection>

        <Button
          label={isEdit ? 'ذخیره تغییرات' : 'ثبت بیمار'}
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
