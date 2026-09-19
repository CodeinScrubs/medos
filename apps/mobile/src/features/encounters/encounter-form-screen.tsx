import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { EditGate } from '@/components/edit-gate';
import { alertError } from '@/components/feedback';
import { PickerModal, type PickerItem } from '@/components/picker-modal';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, ChipSelect, Column, Input, Row, Screen, SelectField } from '@/components/ui';
import type { Encounter } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { doctorDisplayName } from '@/features/doctors/logic';
import { doctorsQuery, quickCreateDoctor } from '@/features/doctors/queries';
import { createPlace, placesQuery } from '@/features/places/queries';
import { useTheme } from '@/theme';

import { ENCOUNTER_KIND_LABELS } from './labels';
import { encounterQuery, openEncounter, updateEncounter } from './queries';

const KIND_OPTIONS = (Object.keys(ENCOUNTER_KIND_LABELS) as Encounter['kind'][]).map((k) => ({
  value: k,
  label: ENCOUNTER_KIND_LABELS[k],
}));

/** Services that come up constantly; the field still accepts anything. */
const COMMON_SERVICES = ['داخلی', 'جراحی', 'اطفال', 'زنان', 'قلب', 'اعصاب', 'عفونی', 'ICU', 'CCU', 'اورژانس'];

/**
 * Open or edit an admission / outpatient episode.
 *
 * Route params: `id` is the patient; `encounterId` present means edit.
 */
export function EncounterFormScreen() {
  const { id: patientId, encounterId } = useLocalSearchParams<{ id: string; encounterId?: string }>();
  const { data } = useLive(encounterQuery(encounterId ?? ''), [encounterId]);
  return (
    <EditGate editing={Boolean(encounterId)} rows={data}>
      {(encounter) => <EncounterForm patientId={patientId} encounter={encounter} />}
    </EditGate>
  );
}

function EncounterForm({ patientId, encounter }: { patientId: string; encounter: Encounter | null }) {
  const router = useRouter();
  const { spacing } = useTheme();
  const isEdit = encounter != null;

  const [kind, setKind] = useState<Encounter['kind']>(encounter?.kind ?? 'admission');
  const [placeId, setPlaceId] = useState<string | null>(encounter?.placeId ?? null);
  const [ward, setWard] = useState(encounter?.ward ?? '');
  const [bed, setBed] = useState(encounter?.bed ?? '');
  const [service, setService] = useState(encounter?.service ?? '');
  const [attendingId, setAttendingId] = useState<string | null>(encounter?.attendingId ?? null);
  const [chiefComplaint, setChiefComplaint] = useState(encounter?.chiefComplaint ?? '');
  const [admittedAt, setAdmittedAt] = useState(() => encounter?.admittedAt ?? new Date());
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<'place' | 'attending' | null>(null);

  const { data: placeRows } = useLive(placesQuery());
  const { data: doctorRows } = useLive(doctorsQuery());

  const placeItems: PickerItem[] = useMemo(
    () => (placeRows ?? []).map((p) => ({ id: p.id, label: p.name, sublabel: p.city })),
    [placeRows],
  );
  const doctorItems: PickerItem[] = useMemo(
    () =>
      (doctorRows ?? []).map((d) => ({
        id: d.id,
        label: doctorDisplayName(d),
        sublabel: d.specialtyText,
        keywords: d.searchText,
      })),
    [doctorRows],
  );

  const placeLabel = placeItems.find((p) => p.id === placeId)?.label ?? null;
  const attendingLabel = doctorItems.find((d) => d.id === attendingId)?.label ?? null;

  async function save() {
    setSaving(true);
    try {
      const payload = {
        kind,
        placeId,
        ward: ward.trim() || null,
        bed: bed.trim() || null,
        service: service.trim() || null,
        attendingId,
        chiefComplaint: chiefComplaint.trim() || null,
        admittedAt,
      };
      if (encounter) await updateEncounter(encounter.id, payload);
      else await openEncounter({ patientId, ...payload });
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
        <ChipSelect label="نوع" options={KIND_OPTIONS} value={kind} onChange={(v) => v && setKind(v)} />

        <SelectField
          label="بیمارستان / مرکز"
          icon="business-outline"
          value={placeLabel}
          placeholder="انتخاب یا افزودن"
          onPress={() => setPicker('place')}
          onClear={() => setPlaceId(null)}
        />

        <Row gap="md">
          <View style={{ flex: 2 }}>
            <Input label="بخش" value={ward} onChangeText={setWard} placeholder="مثلاً داخلی ۲" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="تخت" value={bed} onChangeText={setBed} numericFold />
          </View>
        </Row>

        <Input label="سرویس" value={service} onChangeText={setService} />
        <ChipSelect
          options={COMMON_SERVICES}
          value={COMMON_SERVICES.includes(service) ? service : null}
          onChange={(v) => setService(v ?? '')}
          allowDeselect
        />

        <SelectField
          label="اتند"
          icon="person-outline"
          value={attendingLabel}
          placeholder="انتخاب یا افزودن"
          onPress={() => setPicker('attending')}
          onClear={() => setAttendingId(null)}
        />

        <Input
          label="شکایت اصلی (CC)"
          value={chiefComplaint}
          onChangeText={setChiefComplaint}
          placeholder="مثلاً Abdominal pain since 3 days"
          multiline
        />

        <QuickDateField
          label={kind === 'outpatient' ? 'تاریخ ویزیت' : 'تاریخ بستری'}
          value={admittedAt}
          onChange={setAdmittedAt}
          direction="past"
          withTime
        />

        <Button
          label={isEdit ? 'ذخیره تغییرات' : kind === 'outpatient' ? 'ثبت ویزیت' : 'ثبت بستری'}
          icon="checkmark"
          onPress={() => void save()}
          loading={saving}
          full
          style={{ marginTop: spacing.sm }}
        />
        <Button label="انصراف" variant="ghost" onPress={() => router.back()} full haptic={false} />
      </Column>

      <PickerModal
        visible={picker === 'place'}
        title="بیمارستان / مرکز"
        items={placeItems}
        selectedId={placeId}
        onClose={() => setPicker(null)}
        onSelect={(item) => {
          setPlaceId(item.id);
          setPicker(null);
        }}
        onCreate={async (name) => {
          const id = await createPlace({ name, kind: 'hospital' });
          return { id, label: name };
        }}
        createLabel="افزودن مرکز"
        emptyText="هنوز مرکزی ثبت نشده — نامش را بنویسید و اضافه کنید."
      />

      <PickerModal
        visible={picker === 'attending'}
        title="اتند"
        items={doctorItems}
        selectedId={attendingId}
        onClose={() => setPicker(null)}
        onSelect={(item) => {
          setAttendingId(item.id);
          setPicker(null);
        }}
        onCreate={quickCreateDoctor}
        createLabel="افزودن پزشک"
        emptyText="هنوز پزشکی ثبت نشده — نامش را بنویسید و اضافه کنید."
      />
    </Screen>
  );
}
