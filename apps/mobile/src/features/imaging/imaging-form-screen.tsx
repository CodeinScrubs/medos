import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useDatasetIntent } from '@/components/dataset-intent';
import { EditGate } from '@/components/edit-gate';
import { alertError } from '@/components/feedback';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, ChipSelect, Column, Input, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import type { ImagingStudy } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { askPhotoSource, attachPhotos } from '@/features/attachments/capture';
import { ImageThumbnail } from '@/features/attachments/image-thumbnail';
import { entityAttachmentsQuery } from '@/features/attachments/queries';
import { withDatasetWrite } from '@/lib/dataset-write';
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
  useDatasetIntent();
  const { id: patientId, studyId } = useLocalSearchParams<{ id: string; studyId?: string }>();
  const { data, error, retry } = useLive(imagingStudyQuery(studyId ?? ''), [studyId]);
  return (
    <EditGate editing={Boolean(studyId)} rows={data} error={error} onRetry={retry} what="تصویربرداری" fenceDataset>
      {(study, readNotice, generation) => (
        <ImagingForm readNotice={readNotice} patientId={patientId} study={study} generation={generation} />
      )}
    </EditGate>
  );
}

function ImagingForm({
  patientId,
  study,
  readNotice,
  generation: expectedGeneration,
}: {
  readNotice: ReactNode;
  patientId: string;
  study: ImagingStudy | null;
  generation: number;
}) {
  const router = useRouter();
  const navigation = useNavigation();
  const { generation, stale } = useDatasetIntent(expectedGeneration);
  const { radii, spacing } = useTheme();
  const acting = useRef(false);
  const adding = useRef(false);
  const [completed, setCompleted] = useState(false);

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
    void recentStorageLocations()
      .then(setRecent)
      .catch((e) => alertError('محل‌های قبلی خوانده نشد', e));
  }, []);

  const locationOptions = [...new Set([...recent.locations, ...DEFAULT_LOCATIONS])].slice(0, 8);

  async function save() {
    if (acting.current || completed) return;
    if (!dateValidation.check()) return;
    acting.current = true;
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
      await withDatasetWrite(generation, async () => {
        if (study) await updateImagingStudy(study.id, payload);
        else await createImagingStudy({ patientId, ...payload });
        setCompleted(true);
        if (navigation.isFocused()) router.back();
      });
    } catch (e) {
      alertError('ذخیره نشد', e);
    } finally {
      setSaving(false);
      acting.current = false;
    }
  }

  return (
    <Screen scroll>
      <Column
        collapsable={false}
        gap="md"
        pointerEvents={completed || saving ? 'none' : 'auto'}
        style={{ paddingTop: spacing.md }}
      >
        {readNotice}
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
                    accessibilityRole="button"
                    accessibilityLabel={`نمایش عکس ${a.caption ?? 'تصویربرداری'}`}
                    onPress={() => router.push({ pathname: '/media/[attachmentId]', params: { attachmentId: a.id } })}
                  >
                    <ImageThumbnail attachment={a} width={96} height={96} radius={radii.md} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <Button
              label="عکس از فیلم یا مانیتور"
              icon="camera-outline"
              variant="ghost"
              disabled={stale || completed || saving}
              onPress={() =>
                askPhotoSource((source) => {
                  if (adding.current || completed) return;
                  adding.current = true;
                  void withDatasetWrite(generation, () =>
                    attachPhotos({
                      source,
                      entityType: 'imaging_study',
                      entityId: study.id,
                      patientId,
                      kind: 'radiology',
                    }),
                  )
                    .catch((e) => alertError('عکس ذخیره نشد', e))
                    .finally(() => {
                      adding.current = false;
                    });
                })
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
              disabled={stale || completed}
              full
            />
          </View>
          <Button label="انصراف" variant="ghost" onPress={() => router.back()} haptic={false} />
        </Row>
      </Column>
      {completed ? (
        <Button
          label="ثبت شد؛ بستن"
          variant="ghost"
          onPress={() => {
            if (navigation.isFocused()) router.back();
          }}
        />
      ) : null}
    </Screen>
  );
}
