import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';

import { CollapsibleSection } from '@/components/collapsible-section';
import { EditGate } from '@/components/edit-gate';
import { alertError, notify } from '@/components/feedback';
import { PickerModal } from '@/components/picker-modal';
import { ScreenOptions } from '@/components/screen-options';
import { Button, ChipSelect, Column, Input, Screen, SectionHeader, SelectField, Toggle } from '@/components/ui';
import type { Doctor, Specialty } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { createPlace, placesQuery } from '@/features/places/queries';
import { useTheme } from '@/theme';

import { RELATIONSHIP_LABELS, RELATIONSHIP_ORDER } from './labels';
import { doctorQuery, createDoctor, specialtiesQuery, updateDoctor } from './queries';

const RELATIONSHIP_OPTIONS = RELATIONSHIP_ORDER.map((r) => ({ value: r, label: RELATIONSHIP_LABELS[r] }));

/** A comma-separated field as a list, and back. Empty entries are dropped. */
const toList = (text: string) =>
  text
    .split(/[,،]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Add or edit a doctor. Param: optional `doctorId`. */
export function DoctorFormScreen() {
  const { doctorId } = useLocalSearchParams<{ doctorId?: string }>();
  const { data, error, retry } = useLive(doctorQuery(doctorId ?? ''), [doctorId]);
  return (
    <EditGate editing={Boolean(doctorId)} rows={data} error={error} onRetry={retry} what="پزشک">
      {(doctor, readNotice) => <DoctorForm readNotice={readNotice} doctor={doctor} />}
    </EditGate>
  );
}

function DoctorForm({ doctor, readNotice }: { readNotice: ReactNode; doctor: Doctor | null }) {
  const router = useRouter();
  const { spacing } = useTheme();

  const [title, setTitle] = useState(doctor?.title ?? 'دکتر');
  const [firstName, setFirstName] = useState(doctor?.firstName ?? '');
  const [lastName, setLastName] = useState(doctor?.lastName ?? '');
  const [academicRank, setAcademicRank] = useState(doctor?.academicRank ?? '');
  const [relationship, setRelationship] = useState<Doctor['relationship']>(doctor?.relationship ?? 'colleague');

  const [specialtyId, setSpecialtyId] = useState<string | null>(doctor?.specialtyId ?? null);
  const [subspecialtyId, setSubspecialtyId] = useState<string | null>(doctor?.subspecialtyId ?? null);
  const [specialtyText, setSpecialtyText] = useState(doctor?.specialtyText ?? '');

  const [phone, setPhone] = useState(doctor?.phone ?? '');
  const [phoneAlt, setPhoneAlt] = useState(doctor?.phoneAlt ?? '');
  const [whatsapp, setWhatsapp] = useState(doctor?.whatsapp ?? '');
  const [telegram, setTelegram] = useState(doctor?.telegram ?? '');
  const [email, setEmail] = useState(doctor?.email ?? '');
  const [extension, setExtension] = useState(doctor?.extension ?? '');

  const [primaryPlaceId, setPrimaryPlaceId] = useState<string | null>(doctor?.primaryPlaceId ?? null);
  const [officeAddress, setOfficeAddress] = useState(doctor?.officeAddress ?? '');
  const [officeHours, setOfficeHours] = useState(doctor?.officeHours ?? '');
  const [officePhone, setOfficePhone] = useState(doctor?.officePhone ?? '');

  const [acceptsReferrals, setAcceptsReferrals] = useState(doctor?.acceptsReferrals ?? false);
  const [visitFee, setVisitFee] = useState(doctor?.visitFee ?? '');
  const [insurances, setInsurances] = useState((doctor?.insurances ?? []).join('، '));
  const [referralNotes, setReferralNotes] = useState(doctor?.referralNotes ?? '');

  const [tags, setTags] = useState((doctor?.tags ?? []).join('، '));
  const [notes, setNotes] = useState(doctor?.notes ?? '');
  const [starred, setStarred] = useState(doctor?.starred ?? false);

  const [picker, setPicker] = useState<'specialty' | 'subspecialty' | 'place' | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: specialtyRows } = useLive(specialtiesQuery());
  const { data: placeRows } = useLive(placesQuery());

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
    if (!firstName.trim() || !lastName.trim()) {
      notify('نام و نام خانوادگی لازم است');
      return;
    }
    setSaving(true);
    const payload = {
      title: title.trim() || null,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      academicRank: academicRank.trim() || null,
      relationship,
      specialtyId,
      subspecialtyId,
      specialtyText: specialtyText.trim() || describe(specialtyId, subspecialtyId) || null,
      phone: phone.trim() || null,
      phoneAlt: phoneAlt.trim() || null,
      whatsapp: whatsapp.trim() || null,
      telegram: telegram.trim() || null,
      email: email.trim() || null,
      extension: extension.trim() || null,
      primaryPlaceId,
      officeAddress: officeAddress.trim() || null,
      officeHours: officeHours.trim() || null,
      officePhone: officePhone.trim() || null,
      acceptsReferrals,
      visitFee: visitFee.trim() || null,
      insurances: toList(insurances),
      referralNotes: referralNotes.trim() || null,
      tags: toList(tags),
      notes: notes.trim() || null,
      starred,
    };
    try {
      if (doctor) await updateDoctor(doctor.id, payload);
      else await createDoctor(payload);
      router.back();
    } catch (e) {
      alertError('ذخیره نشد', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: doctor ? 'ویرایش پزشک' : 'پزشک جدید' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {readNotice}
        <Input label="عنوان" value={title} onChangeText={setTitle} placeholder="دکتر" />
        <Input label="نام" required value={firstName} onChangeText={setFirstName} />
        <Input label="نام خانوادگی" required value={lastName} onChangeText={setLastName} />
        <ChipSelect
          label="نسبت"
          options={RELATIONSHIP_OPTIONS}
          value={relationship}
          onChange={(v) => v && setRelationship(v)}
        />

        <SectionHeader title="تخصص" />
        <SelectField
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
          label="عنوان تخصص روی کارت"
          value={specialtyText}
          onChangeText={setSpecialtyText}
          hint="با انتخاب از فهرست خودکار پر می‌شود؛ می‌توانید دست‌نویس بنویسید."
        />
        <Input label="مرتبه‌ی دانشگاهی" value={academicRank} onChangeText={setAcademicRank} placeholder="استادیار" />

        <SectionHeader title="تماس" />
        <Input label="موبایل" value={phone} onChangeText={setPhone} keyboardType="phone-pad" numericFold ltr />
        <Input
          label="شماره‌ی دوم"
          value={phoneAlt}
          onChangeText={setPhoneAlt}
          keyboardType="phone-pad"
          numericFold
          ltr
        />
        <Input label="داخلی بیمارستان" value={extension} onChangeText={setExtension} numericFold ltr />

        <CollapsibleSection
          title="مطب و ارجاع"
          icon="business-outline"
          filledCount={
            [officeAddress, officeHours, officePhone, visitFee, insurances, referralNotes].filter(Boolean).length
          }
        >
          <Column gap="md">
            <SelectField
              label="بیمارستان / مرکز اصلی"
              icon="business-outline"
              value={placeRows?.find((p) => p.id === primaryPlaceId)?.name ?? null}
              onPress={() => setPicker('place')}
              onClear={() => setPrimaryPlaceId(null)}
            />
            <Input label="آدرس مطب" value={officeAddress} onChangeText={setOfficeAddress} multiline />
            <Input
              label="ساعات مطب"
              value={officeHours}
              onChangeText={setOfficeHours}
              placeholder="شنبه تا چهارشنبه ۱۷–۲۰"
            />
            <Input
              label="تلفن مطب"
              value={officePhone}
              onChangeText={setOfficePhone}
              keyboardType="phone-pad"
              numericFold
              ltr
            />
            <Toggle
              label="ارجاع می‌پذیرد"
              description="برای وقتی دنبال کسی می‌گردید که بیمار را بفرستید"
              value={acceptsReferrals}
              onChange={setAcceptsReferrals}
            />
            <Input label="تعرفه‌ی ویزیت" value={visitFee} onChangeText={setVisitFee} />
            <Input
              label="بیمه‌های طرف قرارداد"
              value={insurances}
              onChangeText={setInsurances}
              hint="با ویرگول جدا کنید"
            />
            <Input label="یادداشت ارجاع" value={referralNotes} onChangeText={setReferralNotes} multiline />
          </Column>
        </CollapsibleSection>

        <CollapsibleSection
          title="پیام‌رسان‌ها"
          icon="chatbubbles-outline"
          filledCount={[whatsapp, telegram, email].filter(Boolean).length}
        >
          <Column gap="md">
            <Input
              label="واتس‌اپ"
              value={whatsapp}
              onChangeText={setWhatsapp}
              keyboardType="phone-pad"
              numericFold
              ltr
              hint="اگر با موبایل یکی است، خالی بگذارید"
            />
            <Input
              label="تلگرام"
              value={telegram}
              onChangeText={setTelegram}
              ltr
              autoCapitalize="none"
              placeholder="@username"
            />
            <Input
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
        <Input label="برچسب‌ها" value={tags} onChangeText={setTags} hint="با ویرگول جدا کنید" />
        <Input label="یادداشت" value={notes} onChangeText={setNotes} multiline />
        <Toggle label="ستاره‌دار" description="بالای فهرست پزشکان می‌آید" value={starred} onChange={setStarred} />

        <Button
          label={doctor ? 'ذخیره' : 'ثبت پزشک'}
          icon="checkmark"
          onPress={() => void save()}
          loading={saving}
          full
          style={{ marginTop: spacing.sm }}
        />
        <Button label="انصراف" variant="ghost" onPress={() => router.back()} full haptic={false} />
      </Column>

      <PickerModal
        visible={picker === 'specialty'}
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
        title="بیمارستان / مرکز"
        items={(placeRows ?? []).map((p) => ({ id: p.id, label: p.name, sublabel: p.city }))}
        selectedId={primaryPlaceId}
        onClose={() => setPicker(null)}
        onSelect={(picked) => {
          setPrimaryPlaceId(picked.id);
          setPicker(null);
        }}
        onCreate={async (name) => {
          const id = await createPlace({ name, kind: 'hospital' });
          return { id, label: name };
        }}
        createLabel="افزودن مرکز"
        emptyText="هنوز مرکزی ثبت نشده — نامش را بنویسید و اضافه کنید."
      />
    </Screen>
  );
}
