import { Alert } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Column } from '@/components/ui';
import { VoiceNotePlayer } from '@/components/voice-note-player';
import { VoiceRecorder, type Recording } from '@/components/voice-recorder';
import type { AttachmentEntity } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { withFileJob } from '@/lib/file-work';
import { formatJalaliDateTime } from '@/lib/jalali';
import { mediaUri } from '@/platform/media';

import { addAttachment, checkAttachmentTarget, deleteAttachment, entityAttachmentsQuery } from './queries';
import { stageRecording } from './recordings';

/** Copy and acknowledge a stopped recording without consuming the retry source. */
export async function saveRecording(
  recording: Recording,
  target: { entityType: AttachmentEntity; entityId: string; patientId?: string | null },
): Promise<string> {
  return withFileJob(async () => {
    checkAttachmentTarget(target);
    const stored = await stageRecording(recording, new Date());
    return addAttachment(
      {
        ...target,
        kind: 'voice',
        relativePath: stored.relativePath,
        sizeBytes: stored.sizeBytes,
        mimeType: 'audio/mp4',
        durationMs: recording.durationMs,
        capturedAt: stored.capturedAt,
      },
      { reuseVoice: true },
    );
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
  const { data, error, retry } = useLive(entityAttachmentsQuery(entityType, entityId), [entityType, entityId]);
  const voices = (data ?? []).filter((a) => a.kind === 'voice');

  return (
    <Column gap="sm">
      <ErrorNotice error={error} what="وویس‌ها" onRetry={retry} />
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
                  onPress: () => void deleteAttachment(v.id).catch((e) => alertError('وویس حذف نشد', e)),
                },
              ])
            }
          />
        );
      })}
      <VoiceRecorder
        label={voices.length ? 'وویس دیگر' : 'ضبط وویس'}
        onRecorded={async (rec) => {
          await saveRecording(rec, { entityType, entityId, patientId });
        }}
      />
    </Column>
  );
}
