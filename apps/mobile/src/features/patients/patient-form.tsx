import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { CollapsibleSection } from '@/components/collapsible-section';
import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { JalaliDateField } from '@/components/jalali-date-field';
import { Button, Column, Input, Row, Screen, Segmented, Text } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import { useNow } from '@/components/use-now';
import type { Patient } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { CHOOSABLE_STATUSES, isChoosableStatus } from '@/features/encounters/status';
import { assertDatasetWrite } from '@/lib/dataset-write';
import { parseJalaliInput, toIsoDate } from '@/lib/jalali';
import { isValidNationalId, toLatinDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { PatientFormDraftNotice } from './form-draft-notice';
import { patientFormDraftQuery } from './form-draft-queries';
import { BLOOD_TYPES, PATIENT_STATUS, SEX_LABELS } from './labels';
import { patientFormSeed, usePatientFormDraft, type PatientFormSeed } from './use-form-draft';

/** Read the draft before mounting an editor; read failures must never look like an empty form. */
export function PatientForm({
  patient,
  readNotice,
  generation: expectedGeneration,
}: {
  patient?: Patient;
  readNotice?: ReactNode;
  generation?: number;
}) {
  const { generation, stale } = useDatasetIntent(expectedGeneration);
  const { data, error, retry } = useLive(patientFormDraftQuery(patient?.id ?? null), [patient?.id]);
  const [seed, setSeed] = useState<{ value: PatientFormSeed; generation: number } | null>(null);
  let decodeError: Error | undefined;
  if (!stale && !seed && data) {
    try {
      setSeed({ value: patientFormSeed(patient, data[0] ?? null), generation: 0 });
    } catch (e) {
      decodeError = e instanceof Error ? e : new Error('پیش‌نویس قابل خواندن نیست.');
    }
  }
  const notice = (
    <>
      {stale ? (
        (readNotice ?? <Text color="danger">اطلاعات از بکاپ جایگزین شد؛ نوشته‌های قبلی را مرور یا کپی کنید.</Text>)
      ) : (
        <>
          {readNotice}
          <ErrorNotice error={error ?? decodeError} what="پیش‌نویس بیمار" onRetry={retry} />
        </>
      )}
    </>
  );
  if (!seed)
    return (
      <Screen>
        <Column>
          {notice}
          {!stale && !error && !decodeError ? <Text>بارگذاری پیش‌نویس…</Text> : null}
        </Column>
      </Screen>
    );
  return (
    <PatientFormEditor
      key={seed.generation}
      seed={seed.value}
      generation={generation}
      readNotice={notice}
      onReset={(value) => {
        assertDatasetWrite(generation);
        setSeed({ value, generation: seed.generation + 1 });
      }}
    />
  );
}

function PatientFormEditor({
  seed,
  generation,
  readNotice,
  onReset,
}: {
  seed: PatientFormSeed;
  generation: number;
  readNotice: ReactNode;
  onReset: (seed: PatientFormSeed) => void;
}) {
  const { spacing } = useTheme();
  const isEdit = Boolean(seed.patient);
  const editing = usePatientFormDraft(seed, onReset, generation);
  const { form, set, errors, busy: saving } = editing;
  const dateValidation = useDateValidation();
  const now = useNow();
  const parsedBirthDate = parseJalaliInput(form.birthDateText, new Date(now));
  const nationalIdDigits = toLatinDigits(form.nationalId).replace(/\D/g, '');
  const nationalIdWarning =
    nationalIdDigits.length === 10 && !isValidNationalId(nationalIdDigits)
      ? 'کد ملی با این ارقام معتبر نیست — اگر مطمئنید، رد کنید'
      : undefined;

  return (
    <Screen scroll>
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {readNotice}
        <PatientFormDraftNotice editing={editing} initial={seed} />
        <Row gap="md">
          <View style={{ flex: 1 }}>
            <Input
              editable={!saving && !editing.completedId}
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
              editable={!saving && !editing.completedId}
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
          disabled={saving || !!editing.completedId}
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
              onValidityChange={dateValidation.setValid}
              label="تاریخ تولد"
              value={parsedBirthDate ? toIsoDate(parsedBirthDate) : null}
              rawText={form.birthDateText}
              onRawTextChange={(text) => set('birthDateText', text)}
              editable={!saving && !editing.completedId}
              onChange={() => {}}
              hint="اگر نمی‌دانید، فقط سن را بنویسید"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              editable={!saving && !editing.completedId}
              label="سن"
              value={form.ageYears}
              onChangeText={(v) => set('ageYears', v)}
              error={errors.ageYears}
              keyboardType="number-pad"
              numericFold
              placeholder="سال کامل"
            />
          </View>
        </Row>

        {/*
          "بستری" is not here on purpose: being on a ward is what an open
          admission means, and this form cannot open one. Choosing it here used
          to put a patient on the admitted list with no ward, no bed, no
          admission time and no kardex behind them.
        */}
        <Segmented
          disabled={saving || !!editing.completedId}
          label="وضعیت"
          value={isChoosableStatus(form.status) ? form.status : 'outpatient'}
          onChange={(v) => set('status', v)}
          options={CHOOSABLE_STATUSES.slice(0, 3).map((s) => ({
            value: s,
            label: PATIENT_STATUS[s].label,
          }))}
        />
        {form.status === 'admitted' ? (
          <Text variant="tiny" color="textFaint">
            این بیمار بستری است؛ وضعیتش از پرونده‌ی بستری می‌آید و اینجا عوض نمی‌شود.
          </Text>
        ) : (
          <Text variant="tiny" color="textFaint">
            برای بستری کردن، از «ثبت بستری / ویزیت» در صفحه‌ی بیمار استفاده کنید.
          </Text>
        )}

        <Input
          editable={!saving && !editing.completedId}
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
            editable={!saving && !editing.completedId}
            label="کد ملی"
            value={form.nationalId}
            onChangeText={(v) => set('nationalId', v)}
            keyboardType="number-pad"
            numericFold
            ltr
            hint={nationalIdWarning}
          />
          <Input
            editable={!saving && !editing.completedId}
            label="شماره پرونده"
            value={form.fileNumber}
            onChangeText={(v) => set('fileNumber', v)}
            ltr
          />
          <Input
            editable={!saving && !editing.completedId}
            label="شماره تماس بیمار"
            value={form.phone}
            onChangeText={(v) => set('phone', v)}
            keyboardType="phone-pad"
            numericFold
            ltr
          />
          <Input
            editable={!saving && !editing.completedId}
            label="شهر"
            value={form.city}
            onChangeText={(v) => set('city', v)}
          />
          <Input
            editable={!saving && !editing.completedId}
            label="آدرس"
            value={form.address}
            onChangeText={(v) => set('address', v)}
            multiline
          />
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
            editable={!saving && !editing.completedId}
            label="آلرژی"
            value={form.allergies}
            onChangeText={(v) => set('allergies', v)}
            placeholder="NKDA"
            hint="اگر آلرژی ندارد، NKDA بنویسید تا بعداً معلوم باشد پرسیده‌اید"
          />
          <Input
            editable={!saving && !editing.completedId}
            label="گروه خونی"
            value={form.bloodType}
            onChangeText={(v) => set('bloodType', v.toUpperCase())}
            ltr
            placeholder={BLOOD_TYPES.join(' / ')}
            autoCapitalize="characters"
          />
          <Input
            editable={!saving && !editing.completedId}
            label="سابقه بیماری (PMH)"
            value={form.pastMedicalHistory}
            onChangeText={(v) => set('pastMedicalHistory', v)}
            multiline
          />
          <Input
            editable={!saving && !editing.completedId}
            label="سابقه دارویی"
            value={form.drugHistory}
            onChangeText={(v) => set('drugHistory', v)}
            multiline
          />
          <Input
            editable={!saving && !editing.completedId}
            label="عادات (سیگار، تریاک، الکل)"
            value={form.habitualHistory}
            onChangeText={(v) => set('habitualHistory', v)}
            multiline
          />
          <Input
            editable={!saving && !editing.completedId}
            label="سابقه خانوادگی"
            value={form.familyHistory}
            onChangeText={(v) => set('familyHistory', v)}
            multiline
          />
        </CollapsibleSection>

        <Button
          label={editing.completedId ? 'بازکردن پرونده' : isEdit ? 'ذخیره تغییرات' : 'ثبت بیمار'}
          icon="checkmark"
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
