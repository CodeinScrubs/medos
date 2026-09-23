import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { EditGate } from '@/components/edit-gate';
import { alertError } from '@/components/feedback';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, ChipSelect, Column, Input, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import type { ImagingStudy } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { askPhotoSource, attachPhotos } from '@/features/attachments/capture';
import { entityAttachmentsQuery } from '@/features/attachments/queries';
import { mediaUri } from '@/platform/media';
import { useTheme } from '@/theme';

import { IMAGING_STATUS_LABELS, MODALITY_LABELS } from './labels';
import { createImagingStudy, imagingStudyQuery, recentStorageLocations, updateImagingStudy } from './queries';

const MODALITY_OPTIONS = (Object.keys(MODALITY_LABELS) as ImagingStudy['modality'][]).map((k) => ({
  value: k,
  label: MODALITY_LABELS[k],
}));
const STATUS_OPTIONS = (Object.keys(IMAGING_STATUS_LABELS) as ImagingStudy['status'][]).map((k) => ({
  value: k,
  label: IMAGING_STATUS_LABELS[k],
}));

/** Suggestions shown before the user has history of their own. */
const DEFAULT_LOCATIONS = ['PACS بیمارستان', 'CD دست همراه', 'فیلم چاپی', 'فقط گزارش', 'مرکز تصویربرداری بیرون'];

/** Create or edit an imaging study. Params: `id` (patient), optional `studyId`. */
export function ImagingFormScreen() {
  const { id: patientId, studyId } = useLocalSearchParams<{ id: string; studyId?: string }>();
  const { data } = useLive(imagingStudyQuery(studyId ?? ''), [studyId]);
  return (
    <EditGate editing={Boolean(studyId)} rows={data}>
      {(study) => <ImagingForm patientId={patientId} study={study} />}
    </EditGate>
  );
}

function ImagingForm({ patientId, study }: { patientId: string; study: ImagingStudy | null }) {
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();

  const [modality, setModality] = useState<ImagingStudy['modality']>(study?.modality ?? 'ct');
  const [region, setRegion] = useState(study?.region ?? '');
  const [studyDate, setStudyDate] = useState(() => study?.studyDate ?? new Date());
  const [status, setStatus] = useState<ImagingStudy['status']>(study?.status ?? 'done');
  const [storageLocation, setStorageLocation] = useState(study?.storageLocation ?? '');
  const [storagePlatform, setStoragePlatform] = useState(study?.storagePlatform ?? '');
  const [accessionNumber, setAccessionNumber] = useState(study?.accessionNumber ?? '');
  const [accessUrl, setAccessUrl] = useState(study?.accessUrl ?? '');
  const [accessNotes, setAccessNotes] = useState(study?.accessNotes ?? '');
  const [impression, setImpression] = useState(study?.impression ?? '');
  const [reportText, setReportText] = useState(study?.reportText ?? '');
  const [saving, setSaving] = useState(false);
  const dateValidation = useDateValidation();
  const [recent, setRecent] = useState<{ locations: string[]; platforms: string[] }>({ locations: [], platforms: [] });

  const { data: photos } = useLive(entityAttachmentsQuery('imaging_study', study?.id ?? ''), [study?.id]);

  useEffect(() => {
    void recentStorageLocations().then(setRecent);
  }, []);

  const locationOptions = [...new Set([...recent.locations, ...DEFAULT_LOCATIONS])].slice(0, 8);

  async function save() {
    if (!dateValidation.check()) return;
    setSaving(true);
    const payload = {
      modality,
      region: region.trim() || null,
      studyDate,
      status,
      storageLocation: storageLocation.trim() || null,
      storagePlatform: storagePlatform.trim() || null,
      accessionNumber: accessionNumber.trim() || null,
      accessUrl: accessUrl.trim() || null,
      accessNotes: accessNotes.trim() || null,
      impression: impression.trim() || null,
      reportText: reportText.trim() || null,
    };
    try {
      if (study) await updateImagingStudy(study.id, payload);
      else await createImagingStudy({ patientId, ...payload });
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
        <ChipSelect label="نوع" options={MODALITY_OPTIONS} value={modality} onChange={(v) => v && setModality(v)} />
        <Input label="ناحیه / شرح" value={region} onChangeText={setRegion} placeholder="مثلاً Brain w/o contrast" ltr />
        <QuickDateField
          onValidityChange={dateValidation.setValid}
          label="تاریخ"
          value={studyDate}
          onChange={setStudyDate}
          direction="past"
        />
        <ChipSelect label="وضعیت" options={STATUS_OPTIONS} value={status} onChange={(v) => v && setStatus(v)} />

        <SectionHeader title="کجاست و چطور ببینمش؟" />
        <Input
          label="محل نگهداری"
          value={storageLocation}
          onChangeText={setStorageLocation}
          placeholder="مثلاً PACS بیمارستان مرکزی"
        />
        <ChipSelect
          options={locationOptions}
          value={locationOptions.includes(storageLocation) ? storageLocation : null}
          onChange={(v) => setStorageLocation(v ?? '')}
          allowDeselect
        />
        <Input
          label="پلتفرم / نرم‌افزار"
          value={storagePlatform}
          onChangeText={setStoragePlatform}
          placeholder="مثلاً Marco PACS / سامانه‌ی وب مرکز"
        />
        {recent.platforms.length > 0 && (
          <ChipSelect
            options={recent.platforms}
            value={recent.platforms.includes(storagePlatform) ? storagePlatform : null}
            onChange={(v) => setStoragePlatform(v ?? '')}
            allowDeselect
          />
        )}
        <Input label="شماره پذیرش / Accession" value={accessionNumber} onChangeText={setAccessionNumber} ltr />
        <Input
          label="لینک"
          value={accessUrl}
          onChangeText={setAccessUrl}
          ltr
          autoCapitalize="none"
          keyboardType="url"
        />
        <Input
          label="راهنمای دسترسی"
          value={accessNotes}
          onChangeText={setAccessNotes}
          placeholder="کدام سیستم، با چه یوزری، از چه کسی بپرسم"
          multiline
        />

        <SectionHeader title="گزارش" />
        <Input label="Impression" value={impression} onChangeText={setImpression} ltr multiline />
        <Input label="متن کامل گزارش" value={reportText} onChangeText={setReportText} ltr multiline />

        {study ? (
          <Column gap="sm">
            <SectionHeader title="عکس‌ها" count={photos?.length ?? 0} />
            {photos && photos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                {photos.map((a) => (
                  <Pressable
                    key={a.id}
                    onPress={() => router.push({ pathname: '/media/[attachmentId]', params: { attachmentId: a.id } })}
                  >
                    <Image
                      source={{ uri: mediaUri(a.thumbnailPath ?? a.relativePath) ?? undefined }}
                      style={{ width: 96, height: 96, borderRadius: radii.md, backgroundColor: colors.surfaceAlt }}
                      contentFit="cover"
                    />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <Button
              label="عکس از فیلم یا مانیتور"
              icon="camera-outline"
              variant="ghost"
              onPress={() =>
                askPhotoSource(
                  (source) =>
                    void attachPhotos({
                      source,
                      entityType: 'imaging_study',
                      entityId: study.id,
                      patientId,
                      kind: 'radiology',
                      crop: true,
                    }),
                )
              }
            />
          </Column>
        ) : (
          <Text variant="tiny" color="textFaint">
            بعد از ذخیره، می‌توانید از فیلم یا مانیتور عکس بگیرید و به همین مورد اضافه کنید.
          </Text>
        )}

        <Row gap="sm" style={{ marginTop: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label={study ? 'ذخیره' : 'ثبت'}
              icon="checkmark"
              onPress={() => void save()}
              loading={saving}
              full
            />
          </View>
          <Button label="انصراف" variant="ghost" onPress={() => router.back()} haptic={false} />
        </Row>
      </Column>
    </Screen>
  );
}
