import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { PickerModal, type PickerItem } from '@/components/picker-modal';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, ChipSelect, Column, Input, Row, Screen, SelectField, Text, Toggle } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import { useNow } from '@/components/use-now';
import type { Encounter } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { doctorDisplayName } from '@/features/doctors/logic';
import { doctorsQuery, quickCreateDoctor } from '@/features/doctors/queries';
import { isInpatient } from '@/features/encounters/logic';
import { createPlace, placesQuery } from '@/features/places/queries';
import { useTheme } from '@/theme';

import { encounterFormDisplayDate, type EncounterFormFields } from './form-draft';
import { EncounterFormDraftGate } from './form-draft-gate';
import { EncounterFormDraftNotice } from './form-draft-notice';
import { ENCOUNTER_KIND_LABELS } from './labels';
import { useEncounterFormDraft, type EncounterFormSeed } from './use-form-draft';

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
  const mode = encounterId ? 'edit' : 'new';
  return (
    <EncounterFormDraftGate
      key={mode + ':' + (encounterId ?? patientId)}
      mode={mode}
      patientId={patientId}
      encounterId={encounterId ?? null}
    >
      {(seed, notice, reset) => <EncounterForm seed={seed} readNotice={notice} onReset={reset} />}
    </EncounterFormDraftGate>
  );
}

function EncounterForm({
  seed,
  readNotice,
  onReset,
}: {
  seed: EncounterFormSeed;
  readNotice: ReactNode;
  onReset: (seed: EncounterFormSeed) => void;
}) {
  const { spacing } = useTheme();
  const now = useNow();
  const editing = useEncounterFormDraft(seed, onReset);
  // The keyed gate validates the stored mode before this editor mounts.
  const { kind, placeId, ward, bed, service, attendingId, chiefComplaint, hourKnown } =
    editing.form as EncounterFormFields;
  const change = editing.changeEncounter;
  const encounter = seed.row.target;
  const isEdit = seed.mode === 'edit';
  const saving = editing.busy;
  const locked = saving || !!editing.finishedMessage;
  const dateValidation = useDateValidation();
  const [picker, setPicker] = useState<'place' | 'attending' | null>(null);

  const { data: placeRows, error: placeError, retry: retryPlaces } = useLive(placesQuery());
  const { data: doctorRows, error: doctorError, retry: retryDoctors } = useLive(doctorsQuery());

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

  return (
    <Screen scroll>
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {readNotice}
        <Text variant="bodyStrong">
          {seed.row.patient.firstName} {seed.row.patient.lastName}
        </Text>
        <EncounterFormDraftNotice
          editing={editing}
          seed={seed}
          name={(kind, id) =>
            (kind === 'place' ? placeItems : doctorItems).find((item) => item.id === id)?.label ?? 'در فهرست فعلی نیست'
          }
        />
        <ChipSelect label="نوع" options={KIND_OPTIONS} value={kind} onChange={(v) => v && change({ kind: v })} />

        <ErrorNotice error={placeError} what="فهرست مراکز" onRetry={retryPlaces} />
        <SelectField
          label="بیمارستان / مرکز"
          icon="business-outline"
          value={placeLabel}
          placeholder="انتخاب یا افزودن"
          onPress={() => !locked && setPicker('place')}
          onClear={() => change({ placeId: null })}
        />

        <Row gap="md">
          <View style={{ flex: 2 }}>
            <Input
              label="بخش"
              value={ward}
              onChangeText={(ward) => change({ ward })}
              editable={!locked}
              placeholder="مثلاً داخلی ۲"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="تخت" value={bed} onChangeText={(bed) => change({ bed })} editable={!locked} numericFold />
          </View>
        </Row>

        <Input label="سرویس" value={service} onChangeText={(service) => change({ service })} editable={!locked} />
        <ChipSelect
          options={COMMON_SERVICES}
          value={COMMON_SERVICES.includes(service) ? service : null}
          onChange={(v) => change({ service: v ?? '' })}
          allowDeselect
        />

        <ErrorNotice error={doctorError} what="فهرست پزشکان" onRetry={retryDoctors} />
        <SelectField
          label="اتند"
          icon="person-outline"
          value={attendingLabel}
          placeholder="انتخاب یا افزودن"
          onPress={() => !locked && setPicker('attending')}
          onClear={() => change({ attendingId: null })}
        />

        <Input
          label="شکایت اصلی (CC)"
          value={chiefComplaint}
          onChangeText={(chiefComplaint) => change({ chiefComplaint })}
          editable={!locked}
          placeholder="مثلاً Abdominal pain since 3 days"
          multiline
        />

        <QuickDateField
          onValidityChange={dateValidation.setValid}
          label={kind === 'outpatient' ? 'تاریخ ویزیت' : 'تاریخ بستری'}
          value={encounterFormDisplayDate(editing.document, new Date(now))}
          rawInput={editing.document.fields.date}
          onRawInputChange={editing.changeDate}
          disabled={locked}
          direction="past"
          withTime={hourKnown}
        />

        {isInpatient(kind) ? (
          <Toggle
            label="ساعت بستری را نمی‌دانم"
            description="ساعت ۱۲:۰۱ ظهر فرض می‌شود"
            value={!hourKnown}
            onChange={(v) => change({ hourKnown: !v })}
          />
        ) : null}

        <Button
          label={isEdit ? 'ذخیره تغییرات' : kind === 'outpatient' ? 'ثبت ویزیت' : 'ثبت بستری'}
          icon="checkmark"
          onPress={() => {
            if (dateValidation.check()) void editing.save();
          }}
          loading={saving}
          disabled={!!editing.finishedMessage}
          full
          style={{ marginTop: spacing.sm }}
        />
        <Button label="بستن" variant="ghost" onPress={editing.close} disabled={saving} full haptic={false} />
        {editing.hasDraft && !editing.finishedMessage ? (
          <Button label="حذف پیش‌نویس" variant="ghost" full disabled={saving} onPress={editing.discard} />
        ) : null}
        {encounter ? (
          <Button
            label="حذف (ثبت اشتباه)"
            icon="trash-outline"
            variant="danger"
            size="sm"
            haptic={false}
            disabled={locked}
            onPress={editing.deleteMistake}
            style={{ marginTop: spacing.lg }}
          />
        ) : null}
      </Column>

      <PickerModal
        visible={picker === 'place'}
        title="بیمارستان / مرکز"
        items={placeItems}
        selectedId={placeId}
        onClose={() => setPicker(null)}
        onSelect={(item) => {
          change({ placeId: item.id });
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
          change({ attendingId: item.id });
          setPicker(null);
        }}
        onCreate={quickCreateDoctor}
        createLabel="افزودن پزشک"
        emptyText="هنوز پزشکی ثبت نشده — نامش را بنویسید و اضافه کنید."
      />
    </Screen>
  );
}
