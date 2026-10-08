import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';

import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { CollapsibleSection } from '@/components/collapsible-section';
import { ErrorNotice } from '@/components/error-notice';
import { notify } from '@/components/feedback';
import { PickerModal } from '@/components/picker-modal';
import { ScreenOptions } from '@/components/screen-options';
import { Button, ChipSelect, Column, Input, Screen, SectionHeader, SelectField, Toggle } from '@/components/ui';
import { useNow } from '@/components/use-now';
import type { Specialty } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { createPlace, placesQuery } from '@/features/places/queries';
import { useTheme } from '@/theme';

import type { DoctorFormRow } from './form-draft-queries';
import { RELATIONSHIP_LABELS, RELATIONSHIP_ORDER } from './labels';
import { DoctorDraftNotice, ManualDoctorGate, useManualDoctorForm } from './manual-form';
import { specialtiesQuery } from './queries';

const RELATIONSHIP_OPTIONS = RELATIONSHIP_ORDER.map((r) => ({ value: r, label: RELATIONSHIP_LABELS[r] }));

/** Add or edit a doctor. Param: optional `doctorId`. */
export function DoctorFormScreen() {
  const { doctorId } = useLocalSearchParams<{ doctorId?: string }>();
  const parent = useAutosaveScope();
  const form = <DoctorFormGate key={doctorId ?? 'new'} doctorId={doctorId} />;
  return parent ? form : <AutosaveScope key={doctorId ?? 'new'}>{form}</AutosaveScope>;
}

function DoctorFormGate({ doctorId }: { doctorId?: string }) {
  return (
    <ManualDoctorGate kind="directory" doctorId={doctorId ?? null} what="پزشک">
      {(seed, readNotice, generation, unavailable, onReset) => (
        <DoctorForm
          seed={seed}
          readNotice={readNotice}
          generation={generation}
          unavailable={unavailable}
          onReset={onReset}
        />
      )}
    </ManualDoctorGate>
  );
}

function DoctorForm({
  seed,
  readNotice,
  generation,
  unavailable,
  onReset,
}: {
  onReset: (row: DoctorFormRow) => void;
  readNotice: ReactNode;
  seed: DoctorFormRow;
  generation: number;
  unavailable: boolean;
}) {
  const { spacing } = useTheme();
  const doctor = seed.doctor;
  const now = useNow();
  const editing = useManualDoctorForm('directory', seed, generation, unavailable, onReset);
  const {
    title,
    firstName,
    lastName,
    academicRank,
    relationship,
    specialtyId,
    subspecialtyId,
    specialtyText,
    phone,
    phoneAlt,
    whatsapp,
    telegram,
    email,
    extension,
    primaryPlaceId,
    officeAddress,
    officeHours,
    officePhone,
    acceptsReferrals,
    visitFee,
    insurances,
    referralNotes,
    tags,
    notes,
    starred,
  } = editing.fields;
  const setTitle = (value: typeof title) => editing.change({ title: value });
  const setFirstName = (value: typeof firstName) => editing.change({ firstName: value });
  const setLastName = (value: typeof lastName) => editing.change({ lastName: value });
  const setAcademicRank = (value: typeof academicRank) => editing.change({ academicRank: value });
  const setRelationship = (value: typeof relationship) => editing.change({ relationship: value });
  const setSpecialtyId = (value: typeof specialtyId) => editing.change({ specialtyId: value });
  const setSubspecialtyId = (value: typeof subspecialtyId) => editing.change({ subspecialtyId: value });
  const setSpecialtyText = (value: typeof specialtyText) => editing.change({ specialtyText: value });
  const setPhone = (value: typeof phone) => editing.change({ phone: value });
  const setPhoneAlt = (value: typeof phoneAlt) => editing.change({ phoneAlt: value });
  const setWhatsapp = (value: typeof whatsapp) => editing.change({ whatsapp: value });
  const setTelegram = (value: typeof telegram) => editing.change({ telegram: value });
  const setEmail = (value: typeof email) => editing.change({ email: value });
  const setExtension = (value: typeof extension) => editing.change({ extension: value });
  const setPrimaryPlaceId = (value: typeof primaryPlaceId) => editing.change({ primaryPlaceId: value });
  const setOfficeAddress = (value: typeof officeAddress) => editing.change({ officeAddress: value });
  const setOfficeHours = (value: typeof officeHours) => editing.change({ officeHours: value });
  const setOfficePhone = (value: typeof officePhone) => editing.change({ officePhone: value });
  const setAcceptsReferrals = (value: typeof acceptsReferrals) => editing.change({ acceptsReferrals: value });
  const setVisitFee = (value: typeof visitFee) => editing.change({ visitFee: value });
  const setInsurances = (value: typeof insurances) => editing.change({ insurances: value });
  const setReferralNotes = (value: typeof referralNotes) => editing.change({ referralNotes: value });
  const setTags = (value: typeof tags) => editing.change({ tags: value });
  const setNotes = (value: typeof notes) => editing.change({ notes: value });
  const setStarred = (value: typeof starred) => editing.change({ starred: value });
  const [picker, setPicker] = useState<'specialty' | 'subspecialty' | 'place' | null>(null);
  const { busy: saving, locked } = editing;

  const { data: specialtyRows, error: specialtyError, retry: retrySpecialties } = useLive(specialtiesQuery());
  const { data: placeRows, error: placeError, retry: retryPlaces } = useLive(placesQuery());

  const specialties = useMemo(() => specialtyRows ?? [], [specialtyRows]);
  const byId = useMemo(() => new Map(specialties.map((s) => [s.id, s])), [specialties]);

  const item = (s: Specialty) => ({
    id: s.id,
    label: s.nameFa,
    sublabel: s.nameEn,
    keywords: (s.aliases ?? []).join(' '),
  });

  const topLevel = useMemo(() => specialties.filter((s) => !s.parentId).map(item), [specialties]);
  /** Subspecialties of the chosen specialty; everything, when none is chosen yet. */
  const children = useMemo(
    () => specialties.filter((s) => (specialtyId ? s.parentId === specialtyId : Boolean(s.parentId))).map(item),
    [specialties, specialtyId],
  );

  /** Keep the displayed specialty text in step with the picked rows. */
  function describe(mainId: string | null, subId: string | null): string {
    const main = mainId ? byId.get(mainId)?.nameFa : null;
    const sub = subId ? byId.get(subId)?.nameFa : null;
    return [main, sub].filter(Boolean).join(' — ');
  }

  async function save() {
    await editing.submit((current) => {
      if (!current.firstName.trim() || !current.lastName.trim()) {
        notify('نام و نام خانوادگی لازم است');
        return false;
      }
      return true;
    }, new Date(now));
  }

  function finish() {
    if (editing.completed) editing.close();
    else void save();
  }
  return (
    <Screen scroll>
      <ScreenOptions
        options={{
          title: doctor ? 'ویرایش پزشک' : 'پزشک جدید',
          headerRight: () => (
            <Button
              label={editing.completed ? 'بستن' : doctor ? 'ذخیره' : 'ثبت پزشک'}
              size="sm"
              variant="ghost"
              onPress={finish}
              disabled={locked && !editing.completed}
              loading={saving}
            />
          ),
        }}
      />
      <Column collapsable={false} gap="md" style={{ paddingTop: spacing.md }}>
        {readNotice}
        <DoctorDraftNotice editing={editing} recovered={!!seed.draft} />
        <Input editable={!locked} label="عنوان" value={title} onChangeText={setTitle} placeholder="دکتر" />
        <Input editable={!locked} label="نام" required value={firstName} onChangeText={setFirstName} />
        <Input editable={!locked} label="نام خانوادگی" required value={lastName} onChangeText={setLastName} />
        <ChipSelect
          disabled={locked}
          label="نسبت"
          options={RELATIONSHIP_OPTIONS}
          value={relationship}
          onChange={(v) => v && setRelationship(v)}
        />

        <SectionHeader title="تخصص" />
        <SelectField
          disabled={locked}
          label="تخصص"
          icon="medkit-outline"
          value={specialtyId ? (byId.get(specialtyId)?.nameFa ?? null) : null}
          placeholder="انتخاب از فهرست"
          onPress={() => setPicker('specialty')}
          onClear={() => {
            setSpecialtyId(null);
            setSubspecialtyId(null);
            setSpecialtyText(describe(null, null));
          }}
        />
        <SelectField
          disabled={locked}
          label="فوق تخصص"
          icon="ribbon-outline"
          value={subspecialtyId ? (byId.get(subspecialtyId)?.nameFa ?? null) : null}
          placeholder="اگر دارد"
          onPress={() => setPicker('subspecialty')}
          onClear={() => {
            setSubspecialtyId(null);
            setSpecialtyText(describe(specialtyId, null));
          }}
        />
        <Input
          editable={!locked}
          label="عنوان تخصص روی کارت"
          value={specialtyText}
          onChangeText={setSpecialtyText}
          hint="با انتخاب از فهرست خودکار پر می‌شود؛ می‌توانید دست‌نویس بنویسید."
        />
        <Input
          editable={!locked}
          label="مرتبه‌ی دانشگاهی"
          value={academicRank}
          onChangeText={setAcademicRank}
          placeholder="استادیار"
        />

        <SectionHeader title="تماس" />
        <Input
          editable={!locked}
          label="موبایل"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          numericFold
          ltr
        />
        <Input
          editable={!locked}
          label="شماره‌ی دوم"
          value={phoneAlt}
          onChangeText={setPhoneAlt}
          keyboardType="phone-pad"
          numericFold
          ltr
        />
        <Input
          editable={!locked}
          label="داخلی بیمارستان"
          value={extension}
          onChangeText={setExtension}
          numericFold
          ltr
        />

        <CollapsibleSection
          title="مطب و ارجاع"
          icon="business-outline"
          filledCount={
            [officeAddress, officeHours, officePhone, visitFee, insurances, referralNotes].filter(Boolean).length
          }
        >
          <Column gap="md">
            <SelectField
              disabled={locked}
              label="بیمارستان / مرکز اصلی"
              icon="business-outline"
              value={placeRows?.find((p) => p.id === primaryPlaceId)?.name ?? null}
              onPress={() => setPicker('place')}
              onClear={() => setPrimaryPlaceId(null)}
            />
            <Input
              editable={!locked}
              label="آدرس مطب"
              value={officeAddress}
              onChangeText={setOfficeAddress}
              multiline
            />
            <Input
              editable={!locked}
              label="ساعات مطب"
              value={officeHours}
              onChangeText={setOfficeHours}
              placeholder="شنبه تا چهارشنبه ۱۷–۲۰"
            />
            <Input
              editable={!locked}
              label="تلفن مطب"
              value={officePhone}
              onChangeText={setOfficePhone}
              keyboardType="phone-pad"
              numericFold
              ltr
            />
            <Toggle
              disabled={locked}
              label="ارجاع می‌پذیرد"
              description="برای وقتی دنبال کسی می‌گردید که بیمار را بفرستید"
              value={acceptsReferrals}
              onChange={setAcceptsReferrals}
            />
            <Input editable={!locked} label="تعرفه‌ی ویزیت" value={visitFee} onChangeText={setVisitFee} />
            <Input
              editable={!locked}
              label="بیمه‌های طرف قرارداد"
              value={insurances}
              onChangeText={setInsurances}
              hint="با ویرگول جدا کنید"
            />
            <Input
              editable={!locked}
              label="یادداشت ارجاع"
              value={referralNotes}
              onChangeText={setReferralNotes}
              multiline
            />
          </Column>
        </CollapsibleSection>

        <CollapsibleSection
          title="پیام‌رسان‌ها"
          icon="chatbubbles-outline"
          filledCount={[whatsapp, telegram, email].filter(Boolean).length}
        >
          <Column gap="md">
            <Input
              editable={!locked}
              label="واتس‌اپ"
              value={whatsapp}
              onChangeText={setWhatsapp}
              keyboardType="phone-pad"
              numericFold
              ltr
              hint="اگر با موبایل یکی است، خالی بگذارید"
            />
            <Input
              editable={!locked}
              label="تلگرام"
              value={telegram}
              onChangeText={setTelegram}
              ltr
              autoCapitalize="none"
              placeholder="@username"
            />
            <Input
              editable={!locked}
              label="ایمیل"
              value={email}
              onChangeText={setEmail}
              ltr
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </Column>
        </CollapsibleSection>

        <SectionHeader title="یادداشت" />
        <Input editable={!locked} label="برچسب‌ها" value={tags} onChangeText={setTags} hint="با ویرگول جدا کنید" />
        <Input editable={!locked} label="یادداشت" value={notes} onChangeText={setNotes} multiline />
        <Toggle
          disabled={locked}
          label="ستاره‌دار"
          description="بالای فهرست پزشکان می‌آید"
          value={starred}
          onChange={setStarred}
        />

        <Button
          label={editing.completed ? 'بستن' : doctor ? 'ذخیره' : 'ثبت پزشک'}
          icon="checkmark"
          onPress={finish}
          disabled={locked && !editing.completed}
          loading={saving}
          full
          style={{ marginTop: spacing.sm }}
        />
        {!editing.completed ? (
          <Button label="انصراف" variant="ghost" disabled={saving} onPress={editing.close} full haptic={false} />
        ) : null}
      </Column>

      <PickerModal
        visible={picker === 'specialty'}
        notice={<ErrorNotice error={specialtyError} what="فهرست تخصص‌ها" onRetry={retrySpecialties} />}
        title="تخصص"
        items={topLevel}
        selectedId={specialtyId}
        onClose={() => setPicker(null)}
        onSelect={(picked) => {
          setSpecialtyId(picked.id);
          // A subspecialty of another specialty would be nonsense; clear it.
          const keep = subspecialtyId && byId.get(subspecialtyId)?.parentId === picked.id ? subspecialtyId : null;
          setSubspecialtyId(keep);
          setSpecialtyText(describe(picked.id, keep));
          setPicker(null);
        }}
        emptyText="تخصصی با این نام نیست"
      />

      <PickerModal
        visible={picker === 'subspecialty'}
        notice={<ErrorNotice error={specialtyError} what="فهرست تخصص‌ها" onRetry={retrySpecialties} />}
        title="فوق تخصص"
        items={children}
        selectedId={subspecialtyId}
        onClose={() => setPicker(null)}
        onSelect={(picked) => {
          setSubspecialtyId(picked.id);
          const parent = byId.get(picked.id)?.parentId ?? specialtyId;
          setSpecialtyId(parent ?? null);
          setSpecialtyText(describe(parent ?? null, picked.id));
          setPicker(null);
        }}
        emptyText={specialtyId ? 'این تخصص فوق‌تخصص ثبت‌شده‌ای ندارد' : 'اول تخصص را انتخاب کنید'}
      />

      <PickerModal
        visible={picker === 'place'}
        notice={<ErrorNotice error={placeError} what="فهرست مراکز" onRetry={retryPlaces} />}
        title="بیمارستان / مرکز"
        items={(placeRows ?? []).map((p) => ({ id: p.id, label: p.name, sublabel: p.city }))}
        selectedId={primaryPlaceId}
        onClose={() => setPicker(null)}
        onSelect={(picked) => {
          setPrimaryPlaceId(picked.id);
          setPicker(null);
        }}
        onCreate={async (name) => {
          const id = await editing.inline(() => createPlace({ name, kind: 'hospital' }));
          return { id, label: name };
        }}
        createLabel="افزودن مرکز"
        emptyText="هنوز مرکزی ثبت نشده — نامش را بنویسید و اضافه کنید."
      />
    </Screen>
  );
}
