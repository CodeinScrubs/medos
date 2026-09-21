import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, ChipSelect, Column, EmptyState, SectionHeader } from '@/components/ui';
import { VoiceNotePlayer } from '@/components/voice-note-player';
import { VoiceRecorder } from '@/components/voice-recorder';
import type { AttachmentKind } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { formatJalaliDateTime } from '@/lib/jalali';
import { mediaUri } from '@/platform/media';
import { useTheme } from '@/theme';

import { askPhotoSource, attachPhotos } from './capture';
import { ATTACHMENT_KIND_LABELS } from './labels';
import { deleteAttachment, patientMediaQuery } from './queries';
import { saveRecording } from './voice-notes';

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
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<PhotoFilter>('all');
  const [adding, setAdding] = useState(false);

  const { data, error } = useLive(patientMediaQuery(patientId), [patientId]);
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
        await attachPhotos({
          source,
          entityType: 'patient',
          entityId: patientId,
          patientId,
          kind: addKind,
          // Camera shots get the cropper; gallery picks allow several at once.
          crop: source === 'camera',
          multiple: source === 'library',
        });
      } catch (e) {
        alertError('عکس ذخیره نشد', e);
      } finally {
        setAdding(false);
      }
    });
  }

  return (
    <Column gap="sm" style={{ marginTop: spacing.lg }}>
      <ErrorNotice error={error} what="عکس‌ها و صداها" />
      <ChipSelect options={FILTERS} value={filter} onChange={(v) => setFilter(v ?? 'all')} />

      <Button
        label={`افزودن ${ATTACHMENT_KIND_LABELS[addKind]}`}
        icon="camera-outline"
        variant="secondary"
        full
        loading={adding}
        onPress={addPhotos}
      />

      {photos.length === 0 ? (
        <EmptyState
          icon="images-outline"
          title="عکسی نیست"
          description="عکس ضایعه، ظاهر بیمار، فیلم رادیولوژی یا مدارک — با دوربین یا از گالری."
        />
      ) : (
        <View style={[styles.grid, { gap }]}>
          {photos.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => router.push({ pathname: '/media/[attachmentId]', params: { attachmentId: a.id } })}
              onLongPress={() =>
                Alert.alert('حذف عکس؟', a.caption ?? formatJalaliDateTime(a.capturedAt), [
                  { text: 'انصراف', style: 'cancel' },
                  { text: 'حذف', style: 'destructive', onPress: () => void deleteAttachment(a.id) },
                ])
              }
            >
              <Image
                source={{ uri: mediaUri(a.thumbnailPath ?? a.relativePath) ?? undefined }}
                style={{ width: tile, height: tile, borderRadius: radii.sm, backgroundColor: colors.surfaceAlt }}
                contentFit="cover"
                recyclingKey={a.id}
              />
            </Pressable>
          ))}
        </View>
      )}

      <SectionHeader title="وویس‌ها" count={voices.length} />
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
                { text: 'حذف', style: 'destructive', onPress: () => void deleteAttachment(v.id) },
              ])
            }
          />
        );
      })}
      <VoiceRecorder
        label="ضبط وویس برای این بیمار"
        onRecorded={(rec) => {
          saveRecording(rec, { entityType: 'patient', entityId: patientId, patientId }).catch((e: unknown) =>
            alertError('وویس ذخیره نشد', e),
          );
        }}
      />
    </Column>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
