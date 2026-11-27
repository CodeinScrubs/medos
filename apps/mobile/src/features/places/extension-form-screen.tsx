import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { AutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { notify } from '@/components/feedback';
import { PickerModal, type PickerItem } from '@/components/picker-modal';
import { ScreenOptions } from '@/components/screen-options';
import { Button, ChipSelect, Column, Input, Row, Screen, SelectField, Text } from '@/components/ui';
import type { Extension } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { WorkspaceFormGate } from '@/features/workspace-forms/form-gate';
import { WorkspaceFormDiscard, WorkspaceFormStatus } from '@/features/workspace-forms/form-status';
import type { FormPort, FormSeed } from '@/features/workspace-forms/types';
import { useWorkspaceForm } from '@/features/workspace-forms/use-form';
import { useTheme } from '@/theme';

import { initialExtensionFields, type ExtensionFormFields } from './form-draft';
import { describeExtension, extensionFormPort } from './form-draft-queries';
import { createPlace, extensionPlaceQuery, placesQuery } from './queries';

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
  const { extensionId, placeId, draftId } = useLocalSearchParams<{
    extensionId?: string;
    placeId?: string;
    draftId?: string;
  }>();
  const [intent] = useState(() => ({ placeId: placeId ?? null, port: extensionFormPort(placeId ?? null) }));
  const switchingPlaceRoute = (placeId ?? null) !== intent.placeId;
  return (
    <AutosaveScope>
      <WorkspaceFormGate port={intent.port} recordId={extensionId ?? null} draftId={draftId ?? null}>
        {(seed, readNotice, unavailable) => (
          <ExtensionForm
            port={intent.port}
            seed={seed}
            readNotice={
              <>
                {readNotice}
                {switchingPlaceRoute ? (
                  <Text color="danger">مسیر این فرم تغییر کرده؛ نوشتهٔ قبلی قابل مرور و کپی است.</Text>
                ) : null}
              </>
            }
            unavailable={unavailable || switchingPlaceRoute}
          />
        )}
      </WorkspaceFormGate>
    </AutosaveScope>
  );
}

function ExtensionForm({
  port,
  seed,
  readNotice,
  unavailable,
}: {
  readNotice: ReactNode;
  port: FormPort<Extension, ExtensionFormFields>;
  seed: FormSeed<Extension, ExtensionFormFields>;
  unavailable: boolean;
}) {
  const router = useRouter();
  const { spacing } = useTheme();
  const { stale } = useDatasetIntent();

  const editing = useWorkspaceForm(port, seed, unavailable, () => router.back());
  const isEditing = seed.document.recordId !== null;
  const { placeId, department, extension, directLine, floor, contactPerson, notes } = editing.document.fields;
  const setPlaceId = (placeId: string | null) => editing.change({ placeId });
  const setDepartment = (department: string) => editing.change({ department });
  const [picking, setPicking] = useState(false);
  const { data: placeRows, error: placeError, retry: retryPlaces } = useLive(placesQuery());
  const {
    data: selectedRows,
    error: referenceError,
    retry: retryReference,
  } = useLive(extensionPlaceQuery(placeId), [placeId]);

  const placeItems: PickerItem[] = useMemo(
    () => (stale ? [] : (placeRows ?? [])).map((p) => ({ id: p.id, label: p.name, sublabel: p.city })),
    [placeRows, stale],
  );
  const selected = selectedRows?.[0]?.id === placeId ? selectedRows[0] : null;
  const selectedLabel = selected ? `${selected.name}${selected.deletedAt ? ' (بایگانی‌شده)' : ''}` : null;
  // Display ownership is independent of the raw selected ID. A replacement may
  // reuse that ID for a different name; only original-dataset reads can own it.
  const [ownedPlace, setOwnedPlace] = useState(() =>
    !stale && !referenceError && selected ? { id: selected.id, label: selectedLabel } : null,
  );
  if (!stale && !referenceError && selected && (ownedPlace?.id !== selected.id || ownedPlace.label !== selectedLabel))
    setOwnedPlace({ id: selected.id, label: selectedLabel });
  const placeLabel =
    placeId === null
      ? null
      : stale || referenceError
        ? ownedPlace?.id === placeId
          ? ownedPlace.label
          : 'نام در دسترس نیست'
        : (selectedLabel ?? 'نام در دسترس نیست');
  function describeFields(fields: ExtensionFormFields) {
    return describeExtension(
      fields,
      (stale ? undefined : placeRows?.find((row) => row.id === fields.placeId)?.name) ??
        (fields.placeId === placeId ? (placeLabel ?? undefined) : undefined),
    );
  }

  function save() {
    if (editing.completed || editing.stale) {
      editing.close();
      return;
    }
    void editing.save((fields) => {
      if (referenceError) return false;
      if (fields.placeId === null) {
        notify('بیمارستان را انتخاب کنید');
        return false;
      }
      if (!fields.department.trim() || !fields.extension.trim()) {
        notify('نام بخش و شماره‌ی داخلی لازم است');
        return false;
      }
      return true;
    });
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: isEditing ? 'ویرایش داخلی' : 'داخلی جدید' }} />
      <Column
        collapsable={false}
        gap="md"
        style={{ paddingTop: spacing.md }}
        pointerEvents={editing.busy ? 'none' : 'auto'}
      >
        {readNotice}
        <WorkspaceFormStatus
          editing={editing}
          port={port}
          describeFields={describeFields}
          describeRecord={(row) => describeFields(initialExtensionFields(row))}
        />
        <ErrorNotice error={placeError} what="مکان‌ها" onRetry={retryPlaces} />
        <ErrorNotice error={referenceError} what="بیمارستان انتخاب‌شده" onRetry={retryReference} />
        <SelectField
          label="بیمارستان"
          required
          icon="business-outline"
          value={placeLabel}
          placeholder="انتخاب یا افزودن"
          disabled={editing.locked || !!placeError}
          onPress={() => {
            if (!editing.locked && !placeError) setPicking(true);
          }}
        />
        <Input
          label="بخش"
          required
          value={department}
          editable={!editing.locked}
          onChangeText={setDepartment}
          placeholder="مثلاً اتاق سونو"
        />
        <ChipSelect
          options={COMMON_DEPARTMENTS}
          value={COMMON_DEPARTMENTS.includes(department) ? department : null}
          onChange={(v) => setDepartment(v ?? '')}
          allowDeselect
          disabled={editing.locked}
        />
        <Row gap="md">
          <View style={{ flex: 1 }}>
            <Input
              label="داخلی"
              required
              value={extension}
              onChangeText={(extension) => editing.change({ extension })}
              editable={!editing.locked}
              keyboardType="number-pad"
              ltr
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="طبقه"
              value={floor}
              editable={!editing.locked}
              onChangeText={(floor) => editing.change({ floor })}
            />
          </View>
        </Row>
        <Input
          label="خط مستقیم"
          value={directLine}
          onChangeText={(directLine) => editing.change({ directLine })}
          editable={!editing.locked}
          keyboardType="phone-pad"
          ltr
          hint="اگر بخش شماره‌ی مستقیم دارد؛ تماس از بیرون با این شماره گرفته می‌شود"
        />
        <Input
          label="مسئول / فرد رابط"
          value={contactPerson}
          editable={!editing.locked}
          onChangeText={(contactPerson) => editing.change({ contactPerson })}
        />
        <Input
          label="یادداشت"
          value={notes}
          editable={!editing.locked}
          onChangeText={(notes) => editing.change({ notes })}
          placeholder="مثلاً فقط تا ساعت ۲"
          multiline
        />

        <Row gap="sm" style={{ marginTop: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label={editing.completed || editing.stale ? 'بستن' : 'ذخیره'}
              icon="checkmark"
              onPress={save}
              loading={editing.busy}
              disabled={
                editing.busy ||
                (editing.locked && !editing.completed && !editing.stale) ||
                (!editing.completed && !editing.stale && !!referenceError)
              }
              full
            />
          </View>
          <Button label="بستن" variant="ghost" disabled={editing.busy} onPress={editing.close} haptic={false} />
        </Row>
        <WorkspaceFormDiscard editing={editing} />
      </Column>

      <PickerModal
        visible={picking}
        title="بیمارستان"
        items={placeError ? [] : placeItems}
        selectedId={placeId}
        onClose={() => setPicking(false)}
        onSelect={(item) => {
          if (!editing.canChange() || placeError) return;
          setPlaceId(item.id);
          setPicking(false);
        }}
        onCreate={
          placeError
            ? undefined
            : (name) =>
                editing.related(async () => {
                  const id = await createPlace({ name, kind: 'hospital' });
                  return { id, label: name };
                })
        }
        notice={<ErrorNotice error={placeError} what="مکان‌ها" onRetry={retryPlaces} />}
        createLabel="افزودن بیمارستان"
      />
    </Screen>
  );
}
