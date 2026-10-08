import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView } from 'react-native';

import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { EditGate } from '@/components/edit-gate';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { QuickDateField } from '@/components/quick-date-field';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Card, ChipSelect, Column, Input, Screen, SectionHeader, Text } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import { useNow } from '@/components/use-now';
import type { ImagingStudy } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { askPhotoSource, attachPhotos } from '@/features/attachments/capture';
import { ImageThumbnail } from '@/features/attachments/image-thumbnail';
import { PhotoRecovery } from '@/features/attachments/photo-recovery';
import { entityAttachmentsQuery } from '@/features/attachments/queries';
import { withDatasetWrite } from '@/lib/dataset-write';
import { formatJalaliDateTime } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { decodeImagingForm, imagingFormValues, type ImagingFormFields } from './form-draft';
import { imagingFormQuery, type ImagingFormRow } from './form-draft-queries';
import { IMAGING_STATUS_LABELS, MODALITY_LABELS } from './labels';
import { recentStorageLocations } from './queries';
import { useImagingForm } from './use-form-draft';

const MODALITY_OPTIONS = (Object.keys(MODALITY_LABELS) as ImagingStudy['modality'][]).map((value) => ({
  value,
  label: MODALITY_LABELS[value],
}));
const STATUS_OPTIONS = (Object.keys(IMAGING_STATUS_LABELS) as ImagingStudy['status'][]).map((value) => ({
  value,
  label: IMAGING_STATUS_LABELS[value],
}));
const DEFAULT_LOCATIONS = ['PACS بیمارستان', 'CD دست همراه', 'فیلم چاپی', 'فقط گزارش', 'مرکز تصویربرداری بیرون'];
const ACCESS_FIELDS = [
  { key: 'accessionNumber', label: 'شماره پذیرش / Accession', ltr: true },
  { key: 'accessUrl', label: 'لینک', ltr: true },
  { key: 'accessNotes', label: 'راهنمای دسترسی', multiline: true },
  { key: 'impression', label: 'Impression', ltr: true, multiline: true },
  { key: 'reportText', label: 'متن کامل گزارش', ltr: true, multiline: true },
] as const;

/** One original dataset and retained seed for the whole create/edit route. */
export function ImagingFormScreen() {
  const { id, studyId } = useLocalSearchParams<{ id: string; studyId?: string }>();
  const parent = useAutosaveScope();
  const form = <ImagingGate key={`${id}-${studyId ?? 'new'}`} patientId={id ?? ''} studyId={studyId ?? null} />;
  return parent ? form : <AutosaveScope>{form}</AutosaveScope>;
}
function ImagingGate({ patientId, studyId }: { patientId: string; studyId: string | null }) {
  const { stale } = useDatasetIntent();
  const scope = useAutosaveScope()!;
  const router = useRouter();
  const navigation = useNavigation();
  const query = useLive(imagingFormQuery(patientId, studyId), [patientId, studyId]);
  const [retained, setRetained] = useState<ImagingFormRow[]>();
  const [reset, setReset] = useState(0);
  if (!stale && !retained && query.data?.[0]) setRetained([query.data[0]]);
  const rows = retained ?? (!stale ? query.data : undefined);
  let invalidDraft: Error | undefined;
  try {
    if (rows?.[0]?.draft) decodeImagingForm(rows[0].draft.body);
  } catch (e) {
    invalidDraft = e as Error;
  }
  if (invalidDraft || (stale && !retained))
    return (
      <Screen scroll>
        <ErrorNotice error={invalidDraft} what="پیش‌نویس تصویربرداری" />
        {stale ? <Text color="danger">اطلاعات جایگزین شده؛ فرم را دوباره باز کنید.</Text> : null}
        <Text selectable>{rows?.[0]?.draft?.body}</Text>
        <Button
          label="بازگشت"
          variant="ghost"
          onPress={() => {
            if (!navigation.isFocused()) return;
            if (stale) scope.abandonStale();
            router.back();
          }}
        />
      </Screen>
    );
  return (
    <EditGate editing rows={rows} error={query.error} onRetry={query.retry} what="تصویربرداری و پیش‌نویس" fenceDataset>
      {(row, notice) =>
        row ? (
          <ImagingForm
            key={reset}
            seed={row}
            readNotice={
              <>
                {notice}
                {!stale &&
                retained &&
                !query.error &&
                (query.data?.length === 0 ||
                  query.data?.[0]?.patient.deletedAt ||
                  query.data?.[0]?.study?.deletedAt) ? (
                  <Text color="danger">رکورد در دسترس نیست؛ نوشته نگه داشته شد.</Text>
                ) : null}
              </>
            }
            onReset={(next) => {
              setRetained([next]);
              setReset((n) => n + 1);
            }}
          />
        ) : null
      }
    </EditGate>
  );
}
function ImagingForm({
  seed,
  readNotice,
  onReset,
}: {
  seed: ImagingFormRow;
  readNotice: ReactNode;
  onReset: (row: ImagingFormRow) => void;
}) {
  const router = useRouter();
  const { generation } = useDatasetIntent();
  const { radii, spacing } = useTheme();
  const now = useNow();
  const editing = useImagingForm(seed, onReset);
  const f = editing.form;
  const disabled = editing.busy || !!editing.completed || editing.stale;
  const adding = useRef(false);
  const dateValidation = useDateValidation();
  const study = seed.study;
  const [recent, setRecent] = useState<{ locations: string[]; platforms: string[] }>({ locations: [], platforms: [] });
  const [recentError, setRecentError] = useState<Error>();
  const photos = useLive(entityAttachmentsQuery('imaging_study', study?.id ?? ''), [study?.id]);
  function readLocations() {
    void recentStorageLocations()
      .then((rows) => {
        setRecent(rows);
        setRecentError(undefined);
      })
      .catch(setRecentError);
  }
  useEffect(readLocations, []);
  const locations = [...new Set([...recent.locations, ...DEFAULT_LOCATIONS])].slice(0, 8);
  let date = study?.studyDate ?? new Date(editing.document.initialDate);
  try {
    date = imagingFormValues(editing.document, new Date(now)).studyDate ?? date;
  } catch {
    /* Invalid raw input stays visible. */
  }
  let stored: ImagingFormFields | undefined;
  try {
    if (editing.comparison?.row.draft) stored = decodeImagingForm(editing.comparison.row.draft.body).fields;
  } catch {
    /* Do not replace unreadable data. */
  }
  function finish() {
    if (editing.completed || editing.stale) editing.close();
    else if (!adding.current) {
      if (dateValidation.check()) void editing.save();
      else void editing.retry();
    }
  }
  return (
    <Screen scroll>
      <ScreenOptions
        options={{
          title: 'تصویربرداری',
          headerRight: () => (
            <Button
              label={editing.completed || editing.stale ? 'بستن' : 'ثبت'}
              size="sm"
              variant="ghost"
              onPress={finish}
              loading={editing.busy}
              disabled={editing.busy}
            />
          ),
        }}
      />
      <Column
        collapsable={false}
        gap="md"
        pointerEvents={editing.busy ? 'none' : 'auto'}
        style={{ paddingTop: spacing.md }}
      >
        {readNotice}
        <Text variant="tiny" color={editing.state.status === 'failed' || editing.stale ? 'danger' : 'textMuted'}>
          {editing.completed
            ? 'ثبت انجام شد.'
            : editing.stale
              ? 'اطلاعات جایگزین شده؛ نوشتهٔ قدیمی فقط قابل مرور است.'
              : editing.state.status === 'failed'
                ? 'پیش‌نویس ذخیره نشد؛ نوشته نگه داشته شد.'
                : editing.state.status === 'writing' || editing.state.status === 'pending'
                  ? 'در حال ذخیرهٔ پیش‌نویس…'
                  : editing.state.status === 'saved'
                    ? 'پیش‌نویس ذخیره شد.'
                    : seed.draft
                      ? 'پیش‌نویس بازیابی شد.'
                      : ''}
        </Text>
        <ChipSelect
          disabled={disabled}
          label="نوع"
          options={MODALITY_OPTIONS}
          value={f.modality}
          onChange={(modality) => modality && editing.change({ modality })}
        />
        <Input
          label="ناحیه / شرح"
          value={f.region}
          onChangeText={(region) => editing.change({ region })}
          placeholder="مثلاً Brain w/o contrast"
          ltr
          editable={!disabled}
        />
        <QuickDateField
          label="تاریخ"
          value={date}
          rawInput={f.date}
          onRawInputChange={editing.changeDate}
          direction="past"
          onValidityChange={dateValidation.setValid}
          disabled={disabled}
        />
        <ChipSelect
          disabled={disabled}
          label="وضعیت"
          options={STATUS_OPTIONS}
          value={f.status}
          onChange={(status) => status && editing.change({ status })}
        />
        <SectionHeader title="کجاست و چطور ببینمش؟" />
        <Input
          label="محل نگهداری"
          value={f.storageLocation}
          onChangeText={(storageLocation) => editing.change({ storageLocation })}
          editable={!disabled}
        />
        <ErrorNotice error={recentError} what="محل‌های قبلی" onRetry={readLocations} />
        <ChipSelect
          disabled={disabled}
          options={locations}
          value={locations.includes(f.storageLocation) ? f.storageLocation : null}
          onChange={(v) => editing.change({ storageLocation: v ?? '' })}
          allowDeselect
        />
        <Input
          label="پلتفرم / نرم‌افزار"
          value={f.storagePlatform}
          onChangeText={(storagePlatform) => editing.change({ storagePlatform })}
          editable={!disabled}
        />
        {recent.platforms.length ? (
          <ChipSelect
            disabled={disabled}
            options={recent.platforms}
            value={recent.platforms.includes(f.storagePlatform) ? f.storagePlatform : null}
            onChange={(v) => editing.change({ storagePlatform: v ?? '' })}
            allowDeselect
          />
        ) : null}
        {ACCESS_FIELDS.map(({ key, label, ...props }) => (
          <Input
            key={key}
            label={label}
            value={f[key]}
            onChangeText={(value) => editing.change({ [key]: value })}
            editable={!disabled}
            {...props}
          />
        ))}
        {study ? (
          <Column gap="sm">
            <SectionHeader title="عکس‌ها" count={photos.data?.length} />
            <ErrorNotice error={photos.error} what="عکس‌های تصویربرداری" onRetry={photos.retry} />
            {photos.data?.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                {photos.data.map((a) => (
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
            <PhotoRecovery
              target={{ entityType: 'imaging_study', entityId: study.id, patientId: seed.patient.id }}
              generation={generation}
            />
            <Button
              label="عکس از فیلم یا مانیتور"
              icon="camera-outline"
              variant="ghost"
              disabled={disabled}
              onPress={() =>
                askPhotoSource((source) => {
                  if (adding.current || disabled) return;
                  adding.current = true;
                  void withDatasetWrite(generation, () =>
                    attachPhotos({
                      source,
                      entityType: 'imaging_study',
                      entityId: study.id,
                      patientId: seed.patient.id,
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
        ) : null}
        {(editing.failedWrite || editing.state.status === 'failed') && !editing.completed && !editing.stale ? (
          <>
            <Button
              label="ذخیره نشد؛ تلاش دوباره"
              variant="ghost"
              disabled={disabled}
              onPress={() => void editing.retry()}
            />
            <Button
              label="بررسی نسخهٔ ذخیره‌شده"
              variant="ghost"
              disabled={disabled}
              onPress={() => void editing.compare()}
            />
          </>
        ) : null}
        {editing.comparison ? (
          <Card>
            <Column gap="sm">
              <Text variant="bodyStrong">نسخهٔ ثبت‌شده</Text>
              {editing.comparison.row.study ? (
                <>
                  <Text>
                    {MODALITY_LABELS[editing.comparison.row.study.modality]} ·{' '}
                    {IMAGING_STATUS_LABELS[editing.comparison.row.study.status]}
                  </Text>
                  <Text>
                    {editing.comparison.row.study.studyDate
                      ? formatJalaliDateTime(editing.comparison.row.study.studyDate)
                      : 'تاریخ ثبت نشده'}
                  </Text>
                  <Text selectable>{editing.comparison.row.study.region}</Text>
                  <Text selectable>
                    {[
                      editing.comparison.row.study.storageLocation,
                      editing.comparison.row.study.storagePlatform,
                      editing.comparison.row.study.accessionNumber,
                      editing.comparison.row.study.accessUrl,
                      editing.comparison.row.study.accessNotes,
                      editing.comparison.row.study.impression,
                      editing.comparison.row.study.reportText,
                    ]
                      .filter(Boolean)
                      .join('\n')}
                  </Text>
                </>
              ) : (
                <Text>تصویربرداری هنوز ثبت نشده.</Text>
              )}
              <Text variant="bodyStrong">پیش‌نویس ذخیره‌شده</Text>
              {stored ? (
                <>
                  <Text>
                    {MODALITY_LABELS[stored.modality]} · {IMAGING_STATUS_LABELS[stored.status]} · {stored.date.dateText}
                  </Text>
                  <Text selectable>
                    {[
                      stored.region,
                      stored.storageLocation,
                      stored.storagePlatform,
                      stored.accessionNumber,
                      stored.accessUrl,
                      stored.accessNotes,
                      stored.impression,
                      stored.reportText,
                    ]
                      .filter(Boolean)
                      .join('\n')}
                  </Text>
                </>
              ) : (
                <Text>
                  {editing.comparison.row.draft ? 'پیش‌نویس خوانده نشد؛ داده تغییر نکرد.' : 'پیش‌نویس دیگری ثبت نشده.'}
                </Text>
              )}
              <Button
                label="بارگذاری نسخهٔ ذخیره‌شده"
                variant="ghost"
                disabled={disabled}
                onPress={editing.loadStored}
              />
              {stored || !editing.comparison.row.draft ? (
                <Button label="نگه‌داشتن نسخهٔ من" variant="ghost" disabled={disabled} onPress={editing.keepMine} />
              ) : null}
            </Column>
          </Card>
        ) : null}
        <Button
          label={editing.completed ? 'بستن' : 'ثبت'}
          onPress={finish}
          loading={editing.busy}
          disabled={editing.stale && !editing.completed}
        />
        {!editing.completed ? (
          <Button
            label={editing.stale ? 'بستن فرم قدیمی' : 'انصراف'}
            variant="ghost"
            disabled={editing.busy}
            onPress={editing.close}
          />
        ) : null}
        {editing.hasDraft && !editing.completed && !editing.stale ? (
          <Button label="حذف پیش‌نویس" variant="ghost" disabled={disabled} onPress={editing.discard} />
        ) : null}
      </Column>
    </Screen>
  );
}
