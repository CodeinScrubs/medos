import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AutosaveScope } from '@/components/autosave-scope';
import { notify } from '@/components/feedback';
import { ScreenOptions } from '@/components/screen-options';
import { Button, ChipSelect, Column, Input, Row, Screen, SectionHeader, Text } from '@/components/ui';
import type { Place } from '@/db/schema';
import { WorkspaceFormGate } from '@/features/workspace-forms/form-gate';
import { WorkspaceFormDiscard, WorkspaceFormStatus } from '@/features/workspace-forms/form-status';
import type { FormSeed } from '@/features/workspace-forms/types';
import { useWorkspaceForm } from '@/features/workspace-forms/use-form';
import { useTheme } from '@/theme';

import type { PlaceFormFields } from './form-draft';
import { placeFormPort } from './form-draft-queries';
import { PLACE_KIND_LABELS } from './labels';

const KIND_OPTIONS = (Object.keys(PLACE_KIND_LABELS) as Place['kind'][]).map((k) => ({
  value: k,
  label: PLACE_KIND_LABELS[k],
}));

/** Add or edit a place. Param: optional `placeId`. */
export function PlaceFormScreen() {
  const { placeId, draftId } = useLocalSearchParams<{ placeId?: string; draftId?: string }>();
  return (
    <AutosaveScope>
      <WorkspaceFormGate port={placeFormPort} recordId={placeId ?? null} draftId={draftId ?? null}>
        {(seed, readNotice, unavailable) => <PlaceForm readNotice={readNotice} seed={seed} unavailable={unavailable} />}
      </WorkspaceFormGate>
    </AutosaveScope>
  );
}

function PlaceForm({
  seed,
  readNotice,
  unavailable,
}: {
  readNotice: ReactNode;
  seed: FormSeed<Place, PlaceFormFields>;
  unavailable: boolean;
}) {
  const router = useRouter();
  const { spacing } = useTheme();

  const editing = useWorkspaceForm(placeFormPort, seed, unavailable, () => router.back());
  const isEditing = seed.document.recordId !== null;
  const { name, kind, city, address, phone, switchboard, mapUrl, lat, lng, notes } = editing.document.fields;
  function save() {
    if (editing.completed || editing.stale) {
      editing.close();
      return;
    }
    void editing.save((fields) => {
      if (!fields.name.trim()) {
        notify('نام لازم است');
        return false;
      }
      return true;
    });
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: isEditing ? 'ویرایش مکان' : 'مکان جدید' }} />
      <Column
        collapsable={false}
        gap="md"
        style={{ paddingTop: spacing.md }}
        pointerEvents={editing.busy ? 'none' : 'auto'}
      >
        {readNotice}
        <WorkspaceFormStatus port={placeFormPort} editing={editing} />
        <Input
          label="نام"
          required
          value={name}
          editable={!editing.locked}
          onChangeText={(name) => editing.change({ name })}
          placeholder="مثلاً بیمارستان مرکزی"
        />
        <ChipSelect
          label="نوع"
          options={KIND_OPTIONS}
          value={kind}
          disabled={editing.locked}
          onChange={(v) => v && editing.change({ kind: v })}
        />
        <Input label="شهر" value={city} editable={!editing.locked} onChangeText={(city) => editing.change({ city })} />
        <Input
          label="آدرس"
          value={address}
          editable={!editing.locked}
          onChangeText={(address) => editing.change({ address })}
          multiline
        />

        <SectionHeader title="تماس" />
        <Input
          label="تلفن"
          value={phone}
          editable={!editing.locked}
          onChangeText={(phone) => editing.change({ phone })}
          keyboardType="phone-pad"
          ltr
        />
        <Input
          label="تلفنخانه (برای گرفتن داخلی از بیرون)"
          value={switchboard}
          onChangeText={(switchboard) => editing.change({ switchboard })}
          editable={!editing.locked}
          keyboardType="phone-pad"
          ltr
          hint="با داشتن این شماره، دکمه‌ی تماس هر داخلی از بیرون مستقیم آن داخلی را می‌گیرد"
        />

        <SectionHeader title="نقشه" />
        <Input
          label="لینک نقشه (نشان، بلد، گوگل)"
          value={mapUrl}
          onChangeText={(mapUrl) => editing.change({ mapUrl })}
          editable={!editing.locked}
          ltr
          autoCapitalize="none"
          keyboardType="url"
        />
        <Row gap="md">
          <View style={{ flex: 1 }}>
            <Input
              label="عرض جغرافیایی"
              value={lat}
              onChangeText={(lat) => editing.change({ lat })}
              editable={!editing.locked}
              ltr
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="طول جغرافیایی"
              value={lng}
              onChangeText={(lng) => editing.change({ lng })}
              editable={!editing.locked}
              ltr
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </Row>
        <Text variant="tiny" color="textFaint">
          کافی است لینک مکان را از برنامه‌ی نقشه کپی کنید؛ هنگام ذخیره، مختصات خالی از لینک کامل می‌شود.
        </Text>

        <Input
          label="یادداشت"
          value={notes}
          editable={!editing.locked}
          onChangeText={(notes) => editing.change({ notes })}
          multiline
        />

        <Row gap="sm" style={{ marginTop: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label={editing.completed || editing.stale ? 'بستن' : 'ذخیره'}
              icon="checkmark"
              onPress={save}
              loading={editing.busy}
              disabled={editing.busy || (editing.locked && !editing.completed && !editing.stale)}
              full
            />
          </View>
          <Button label="بستن" variant="ghost" disabled={editing.busy} onPress={editing.close} haptic={false} />
        </Row>
        <WorkspaceFormDiscard editing={editing} />
      </Column>
    </Screen>
  );
}
