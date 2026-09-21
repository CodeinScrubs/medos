import { Alert } from 'react-native';

import { alertError } from '@/components/feedback';
import { Column } from '@/components/ui';
import { VoiceNotePlayer } from '@/components/voice-note-player';
import { VoiceRecorder, type Recording } from '@/components/voice-recorder';
import type { AttachmentEntity } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { formatJalaliDateTime } from '@/lib/jalali';
import { extensionOf, mediaUri, storeFile } from '@/platform/media';

import { addAttachment, deleteAttachment, entityAttachmentsQuery } from './queries';

/** Move a finished recording into storage and attach it. */
export async function saveRecording(
  recording: Recording,
  target: { entityType: AttachmentEntity; entityId: string; patientId?: string | null },
): Promise<string> {
  const stored = await storeFile(recording.uri, extensionOf(recording.uri, 'm4a'), { move: true });
  return addAttachment({
    ...target,
    kind: 'voice',
    relativePath: stored.relativePath,
    sizeBytes: stored.sizeBytes,
    mimeType: 'audio/mp4',
    durationMs: recording.durationMs,
  });
}

/**
 * Voice notes on an existing record: the list, plus a record button that saves
 * as soon as recording stops. Works on any attachable entity.
 */
export function VoiceNotesSection({
  entityType,
  entityId,
  patientId,
}: {
  entityType: AttachmentEntity;
  entityId: string;
  patientId?: string | null;
}) {
  const { data } = useLive(entityAttachmentsQuery(entityType, entityId), [entityType, entityId]);
  const voices = (data ?? []).filter((a) => a.kind === 'voice');

  return (
    <Column gap="sm">
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
        label={voices.length ? 'وویس دیگر' : 'ضبط وویس'}
        onRecorded={(rec) => {
          saveRecording(rec, { entityType, entityId, patientId }).catch((e: unknown) =>
            alertError('وویس ذخیره نشد', e),
          );
        }}
      />
    </Column>
  );
}
