import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, ChipSelect, Column, SectionHeader, Text } from '@/components/ui';
import { VoiceNotePlayer } from '@/components/voice-note-player';
import { VoiceRecorder } from '@/components/voice-recorder';
import type { AttachmentKind } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { withDatasetWrite } from '@/lib/dataset-write';
import { formatJalaliDateTime } from '@/lib/jalali';
import { mediaUri } from '@/platform/media';
import { useTheme } from '@/theme';

import { askPhotoSource, attachPhotos } from './capture';
import { ImageThumbnail } from './image-thumbnail';
import { ATTACHMENT_KIND_LABELS } from './labels';
import { deleteAttachment, patientMediaQuery } from './queries';
import { RecordingRecovery } from './recording-recovery';
import { useRecordingHandoff } from './voice-notes';

type PhotoFilter = 'all' | 'clinical_photo' | 'radiology' | 'lab_sheet' | 'document';

const FILTERS: { value: PhotoFilter; label: string }[] = [
  { value: 'all', label: 'همه' },
  { value: 'clinical_photo', label: ATTACHMENT_KIND_LABELS.clinical_photo },
  { value: 'radiology', label: ATTACHMENT_KIND_LABELS.radiology },
  { value: 'lab_sheet', label: ATTACHMENT_KIND_LABELS.lab_sheet },
  { value: 'document', label: ATTACHMENT_KIND_LABELS.document },
];

const PHOTO_KINDS: AttachmentKind[] = ['photo', 'clinical_photo', 'radiology', 'lab_sheet', 'document'];

/**
 * Every photo and voice note in one patient's record.
 *
 * The filter chip doubles as "add as": with «رادیولوژی» selected, new photos
 * are filed as radiology. It saves a question on every capture.
 */
export function MediaTab({ patientId }: { patientId: string }) {
  const { generation } = useDatasetIntent();
  const router = useRouter();
  const { radii, spacing } = useTheme();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<PhotoFilter>('all');
  const [adding, setAdding] = useState(false);
  const voiceTarget = { entityType: 'patient' as const, entityId: patientId, patientId };
  const handoff = useRecordingHandoff(voiceTarget);

  const { data, error, retry } = useLive(patientMediaQuery(patientId), [patientId]);
  const all = data ?? [];
  const photos = all.filter(
    (a) =>
      PHOTO_KINDS.includes(a.kind) &&
      (filter === 'all' || a.kind === filter || (filter === 'clinical_photo' && a.kind === 'photo')),
  );
  const voices = all.filter((a) => a.kind === 'voice');

  const addKind: AttachmentKind = filter === 'all' ? 'clinical_photo' : filter;
  const columns = 3;
  const gap = spacing.xs;
  const tile = Math.floor((width - spacing.lg * 2 - gap * (columns - 1)) / columns);

  function addPhotos() {
    askPhotoSource(async (source) => {
      setAdding(true);
      try {
        await withDatasetWrite(generation, () =>
          attachPhotos({
            source,
            entityType: 'patient',
            entityId: patientId,
            patientId,
            kind: addKind,
            // Originals are imported intact; crop/annotation happens in the viewer.
            multiple: source === 'library',
          }),
        );
      } catch (e) {
        alertError('عکس ذخیره نشد', e);
      } finally {
        setAdding(false);
      }
    });
  }

  return (
    <Column gap="sm" style={{ marginTop: spacing.lg }}>
      <ErrorNotice error={error} what="عکس‌ها و صداها" onRetry={retry} />
      <ChipSelect options={FILTERS} value={filter} onChange={(v) => setFilter(v ?? 'all')} />

      <Button
        label={`افزودن ${ATTACHMENT_KIND_LABELS[addKind]}`}
        icon="camera-outline"
        variant="secondary"
        full
        loading={adding}
        onPress={addPhotos}
      />

      {photos.length === 0 && data !== undefined && !error ? (
        <Text variant="caption" color="textMuted" align="center">
          {filter === 'all' ? 'هنوز عکسی ثبت نشده' : 'در این دسته عکسی نیست'}
        </Text>
      ) : (
        <View style={[styles.grid, { gap }]}>
          {photos.map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              accessibilityLabel={`نمایش عکس ${a.caption ?? ATTACHMENT_KIND_LABELS[a.kind]}`}
              onPress={() => router.push({ pathname: '/media/[attachmentId]', params: { attachmentId: a.id } })}
              onLongPress={() =>
                Alert.alert('حذف عکس؟', a.caption ?? formatJalaliDateTime(a.capturedAt), [
                  { text: 'انصراف', style: 'cancel' },
                  {
                    text: 'حذف',
                    style: 'destructive',
                    onPress: () =>
                      void withDatasetWrite(generation, () => deleteAttachment(a.id)).catch((e) =>
                        alertError('عکس حذف نشد', e),
                      ),
                  },
                ])
              }
            >
              <ImageThumbnail attachment={a} width={tile} height={tile} radius={radii.sm} />
            </Pressable>
          ))}
        </View>
      )}

      <SectionHeader title="وویس‌ها" count={data !== undefined && !error ? voices.length : undefined} />
      <RecordingRecovery target={voiceTarget} excludeId={handoff.ownedId} />
      <VoiceRecorder
        label="ضبط وویس برای این بیمار"
        onRecorded={handoff.onRecorded}
        onDiscarded={handoff.onDiscarded}
      />
      {voices.map((v) => {
        return (
          <VoiceNotePlayer
            key={v.id}
            uri={mediaUri(v.relativePath)}
            relativePath={v.relativePath}
            durationMs={v.durationMs}
            caption={v.caption ?? formatJalaliDateTime(v.capturedAt)}
            onLongPress={() =>
              Alert.alert('حذف وویس؟', undefined, [
                { text: 'انصراف', style: 'cancel' },
                {
                  text: 'حذف',
                  style: 'destructive',
                  onPress: () =>
                    void withDatasetWrite(generation, () => deleteAttachment(v.id)).catch((e) =>
                      alertError('وویس حذف نشد', e),
                    ),
                },
              ])
            }
          />
        );
      })}
    </Column>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
