import { useState } from 'react';
import { Alert } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Column } from '@/components/ui';
import { VoiceNotePlayer } from '@/components/voice-note-player';
import { VoiceRecorder, type Recording } from '@/components/voice-recorder';
import type { AttachmentEntity } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { formatJalaliDateTime } from '@/lib/jalali';
import { mediaUri } from '@/platform/media';

import { deleteAttachment, entityAttachmentsQuery } from './queries';
import { discardStoppedRecording, persistRecording, recordingOperationId } from './recording-queries';
import { RecordingRecovery } from './recording-recovery';

/** Persist a stopped operation and acknowledge its metadata without consuming its source. */
export async function saveRecording(
  recording: Recording,
  target: { entityType: AttachmentEntity; entityId: string; patientId?: string | null },
  now: Date = new Date(),
): Promise<string> {
  return persistRecording(recording, target, now);
}

/** Keep one owner for a failed capture; recovery controls take over after remount. */
export function useRecordingHandoff(target: {
  entityType: AttachmentEntity;
  entityId: string;
  patientId?: string | null;
}) {
  const [ownedId, setOwnedId] = useState<string | undefined>();
  return {
    ownedId,
    onRecorded: async (recording: Recording) => {
      setOwnedId(recordingOperationId(recording));
      await saveRecording(recording, target);
      setOwnedId(undefined);
    },
    onDiscarded: async (recording: Recording) => {
      await discardStoppedRecording(recording, target, new Date());
      setOwnedId(undefined);
    },
  };
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
  const handoff = useRecordingHandoff({ entityType, entityId, patientId });

  return (
    <Column gap="sm">
      <ErrorNotice error={error} what="وویس‌ها" onRetry={retry} />
      <RecordingRecovery target={{ entityType, entityId, patientId }} excludeId={handoff.ownedId} />
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
        onRecorded={handoff.onRecorded}
        onDiscarded={handoff.onDiscarded}
      />
    </Column>
  );
}
