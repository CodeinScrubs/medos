import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { EditGate } from '@/components/edit-gate';
import { alertError } from '@/components/feedback';
import { Button, ChipSelect, Column, Input, Row, Screen, SectionHeader, Text } from '@/components/ui';
import type { Place } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { useTheme } from '@/theme';

import { PLACE_KIND_LABELS } from './labels';
import { parseCoordinates } from './logic';
import { createPlace, placeQuery, updatePlace } from './queries';

const KIND_OPTIONS = (Object.keys(PLACE_KIND_LABELS) as Place['kind'][]).map((k) => ({
  value: k,
  label: PLACE_KIND_LABELS[k],
}));

/** Add or edit a place. Param: optional `placeId`. */
export function PlaceFormScreen() {
  const { placeId } = useLocalSearchParams<{ placeId?: string }>();
  const { data } = useLive(placeQuery(placeId ?? ''), [placeId]);
  return (
    <EditGate editing={Boolean(placeId)} rows={data}>
      {(place) => <PlaceForm place={place} />}
    </EditGate>
  );
}

function PlaceForm({ place }: { place: Place | null }) {
  const router = useRouter();
  const { spacing } = useTheme();

  const [name, setName] = useState(place?.name ?? '');
  const [kind, setKind] = useState<Place['kind']>(place?.kind ?? 'hospital');
  const [city, setCity] = useState(place?.city ?? '');
  const [address, setAddress] = useState(place?.address ?? '');
  const [phone, setPhone] = useState(place?.phone ?? '');
  const [switchboard, setSwitchboard] = useState(place?.switchboard ?? '');
  const [mapUrl, setMapUrl] = useState(place?.mapUrl ?? '');
  const [lat, setLat] = useState(place?.lat ?? '');
  const [lng, setLng] = useState(place?.lng ?? '');
  const [notes, setNotes] = useState(place?.notes ?? '');
  const [saving, setSaving] = useState(false);

  /** A pasted Neshan/Google link often carries coordinates; pull them out. */
  function onMapUrl(text: string) {
    setMapUrl(text);
    const coords = parseCoordinates(text);
    if (coords && !lat && !lng) {
      setLat(coords.lat);
      setLng(coords.lng);
    }
  }

  async function save() {
    if (!name.trim()) {
      Alert.alert('نام لازم است');
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      kind,
      city: city.trim() || null,
      address: address.trim() || null,
      phone: phone.trim() || null,
      switchboard: switchboard.trim() || null,
      mapUrl: mapUrl.trim() || null,
      lat: lat.trim() || null,
      lng: lng.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (place) await updatePlace(place.id, payload);
      else await createPlace(payload);
      router.back();
    } catch (e) {
      alertError('ذخیره نشد', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: place ? 'ویرایش مکان' : 'مکان جدید' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <Input label="نام" required value={name} onChangeText={setName} placeholder="مثلاً بیمارستان مرکزی" />
        <ChipSelect label="نوع" options={KIND_OPTIONS} value={kind} onChange={(v) => v && setKind(v)} />
        <Input label="شهر" value={city} onChangeText={setCity} />
        <Input label="آدرس" value={address} onChangeText={setAddress} multiline />

        <SectionHeader title="تماس" />
        <Input label="تلفن" value={phone} onChangeText={setPhone} keyboardType="phone-pad" numericFold ltr />
        <Input
          label="تلفنخانه (برای گرفتن داخلی از بیرون)"
          value={switchboard}
          onChangeText={setSwitchboard}
          keyboardType="phone-pad"
          numericFold
          ltr
          hint="با داشتن این شماره، دکمه‌ی تماس هر داخلی از بیرون مستقیم آن داخلی را می‌گیرد"
        />

        <SectionHeader title="نقشه" />
        <Input
          label="لینک نقشه (نشان، بلد، گوگل)"
          value={mapUrl}
          onChangeText={onMapUrl}
          ltr
          autoCapitalize="none"
          keyboardType="url"
        />
        <Row gap="md">
          <View style={{ flex: 1 }}>
            <Input
              label="عرض جغرافیایی"
              value={lat}
              onChangeText={setLat}
              numericFold
              ltr
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="طول جغرافیایی"
              value={lng}
              onChangeText={setLng}
              numericFold
              ltr
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </Row>
        <Text variant="tiny" color="textFaint">
          کافی است لینک مکان را از برنامه‌ی نقشه کپی کنید؛ اگر مختصات داخلش باشد خودکار پر می‌شود.
        </Text>

        <Input label="یادداشت" value={notes} onChangeText={setNotes} multiline />

        <Row gap="sm" style={{ marginTop: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button label="ذخیره" icon="checkmark" onPress={() => void save()} loading={saving} full />
          </View>
          <Button label="انصراف" variant="ghost" onPress={() => router.back()} haptic={false} />
        </Row>
      </Column>
    </Screen>
  );
}
