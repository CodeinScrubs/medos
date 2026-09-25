import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { EditGate } from '@/components/edit-gate';
import { alertError, notify } from '@/components/feedback';
import { PickerModal, type PickerItem } from '@/components/picker-modal';
import { ScreenOptions } from '@/components/screen-options';
import { Button, ChipSelect, Column, Input, Row, Screen, SelectField } from '@/components/ui';
import type { Extension } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { toLatinDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { createExtension, createPlace, extensionQuery, placesQuery, updateExtension } from './queries';

const COMMON_DEPARTMENTS = [
  'اورژانس',
  'ICU',
  'CCU',
  'سونوگرافی',
  'رادیولوژی',
  'سی‌تی اسکن',
  'MRI',
  'آزمایشگاه',
  'بانک خون',
  'داروخانه',
  'اتاق عمل',
  'پذیرش',
  'ایستگاه پرستاری',
  'پاتولوژی',
  'آندوسکوپی',
  'اکو',
];

/** Add or edit an extension. Params: optional `extensionId`, optional `placeId`. */
export function ExtensionFormScreen() {
  const { extensionId, placeId } = useLocalSearchParams<{ extensionId?: string; placeId?: string }>();
  const { data, error, retry } = useLive(extensionQuery(extensionId ?? ''), [extensionId]);
  return (
    <EditGate editing={Boolean(extensionId)} rows={data} error={error} onRetry={retry} what="شمارهٔ داخلی">
      {(record, readNotice) => (
        <ExtensionForm readNotice={readNotice} record={record} initialPlaceId={placeId ?? null} />
      )}
    </EditGate>
  );
}

function ExtensionForm({
  record,
  initialPlaceId,
  readNotice,
}: {
  readNotice: ReactNode;
  record: Extension | null;
  initialPlaceId: string | null;
}) {
  const router = useRouter();
  const { spacing } = useTheme();

  const [placeId, setPlaceId] = useState<string | null>(record?.placeId ?? initialPlaceId);
  const [department, setDepartment] = useState(record?.department ?? '');
  const [extension, setExtension] = useState(record?.extension ?? '');
  const [directLine, setDirectLine] = useState(record?.directLine ?? '');
  const [floor, setFloor] = useState(record?.floor ?? '');
  const [contactPerson, setContactPerson] = useState(record?.contactPerson ?? '');
  const [notes, setNotes] = useState(record?.notes ?? '');
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: placeRows } = useLive(placesQuery());

  const placeItems: PickerItem[] = useMemo(
    () => (placeRows ?? []).map((p) => ({ id: p.id, label: p.name, sublabel: p.city })),
    [placeRows],
  );
  const placeLabel = placeItems.find((p) => p.id === placeId)?.label ?? null;

  async function save() {
    if (!placeId) {
      notify('بیمارستان را انتخاب کنید');
      return;
    }
    if (!department.trim() || !extension.trim()) {
      notify('نام بخش و شماره‌ی داخلی لازم است');
      return;
    }
    setSaving(true);
    const payload = {
      placeId,
      department: department.trim(),
      extension: toLatinDigits(extension).trim(),
      directLine: directLine.trim() || null,
      floor: floor.trim() || null,
      contactPerson: contactPerson.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (record) await updateExtension(record.id, payload);
      else await createExtension(payload);
      router.back();
    } catch (e) {
      alertError('ذخیره نشد', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: record ? 'ویرایش داخلی' : 'داخلی جدید' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {readNotice}
        <SelectField
          label="بیمارستان"
          required
          icon="business-outline"
          value={placeLabel}
          placeholder="انتخاب یا افزودن"
          onPress={() => setPicking(true)}
        />
        <Input label="بخش" required value={department} onChangeText={setDepartment} placeholder="مثلاً اتاق سونو" />
        <ChipSelect
          options={COMMON_DEPARTMENTS}
          value={COMMON_DEPARTMENTS.includes(department) ? department : null}
          onChange={(v) => setDepartment(v ?? '')}
          allowDeselect
        />
        <Row gap="md">
          <View style={{ flex: 1 }}>
            <Input
              label="داخلی"
              required
              value={extension}
              onChangeText={setExtension}
              keyboardType="number-pad"
              numericFold
              ltr
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="طبقه" value={floor} onChangeText={setFloor} numericFold />
          </View>
        </Row>
        <Input
          label="خط مستقیم"
          value={directLine}
          onChangeText={setDirectLine}
          keyboardType="phone-pad"
          numericFold
          ltr
          hint="اگر بخش شماره‌ی مستقیم دارد؛ تماس از بیرون با این شماره گرفته می‌شود"
        />
        <Input label="مسئول / فرد رابط" value={contactPerson} onChangeText={setContactPerson} />
        <Input label="یادداشت" value={notes} onChangeText={setNotes} placeholder="مثلاً فقط تا ساعت ۲" multiline />

        <Row gap="sm" style={{ marginTop: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button label="ذخیره" icon="checkmark" onPress={() => void save()} loading={saving} full />
          </View>
          <Button label="انصراف" variant="ghost" onPress={() => router.back()} haptic={false} />
        </Row>
      </Column>

      <PickerModal
        visible={picking}
        title="بیمارستان"
        items={placeItems}
        selectedId={placeId}
        onClose={() => setPicking(false)}
        onSelect={(item) => {
          setPlaceId(item.id);
          setPicking(false);
        }}
        onCreate={async (name) => {
          const id = await createPlace({ name, kind: 'hospital' });
          return { id, label: name };
        }}
        createLabel="افزودن بیمارستان"
      />
    </Screen>
  );
}
