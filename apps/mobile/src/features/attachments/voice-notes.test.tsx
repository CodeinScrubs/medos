import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { VoiceNotePlayer } from '@/components/voice-note-player';
import { VoiceRecorder } from '@/components/voice-recorder';
import { attachments } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { addAttachment } from './queries';
import { VoiceNotesSection } from './voice-notes';

const mockPersist = jest.fn(async () => 'ack');
const mockDiscard = jest.fn(async () => {});
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[] }) => ({ data: query.all(), retry: jest.fn() }),
}));
jest.mock('@/components/ui', () => ({ Column: 'Column' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn() }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/voice-note-player', () => ({ VoiceNotePlayer: 'VoiceNotePlayer' }));
jest.mock('@/components/voice-recorder', () => ({ VoiceRecorder: 'VoiceRecorder' }));
jest.mock('@/platform/media', () => ({ mediaUri: (value: string) => value }));
jest.mock('./recording-recovery', () => ({ RecordingRecovery: 'RecordingRecovery' }));
jest.mock('./recording-queries', () => ({
  recordingOperationId: () => 'operation',
  persistRecording: () => mockPersist(),
  discardStoppedRecording: () => mockDiscard(),
}));
let tree: ReactTestRenderer | undefined;
let t: TestDatabase;
let patientId: string;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Voice' });
  await addAttachment({
    entityType: 'patient',
    entityId: patientId,
    patientId,
    kind: 'voice',
    relativePath: 'media/test/voice.m4a',
    durationMs: 1000,
    mimeType: 'audio/mp4',
    sizeBytes: 100,
    capturedAt: new Date(),
  });
  mockPersist.mockClear();
  mockDiscard.mockClear();
  jest.mocked(alertError).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await act(async () => {
    tree = create(<VoiceNotesSection entityType="patient" entityId={patientId} patientId={patientId} />);
  });
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});

describe('mounted voice actions after dataset replacement', () => {
  it('rejects a delayed delete confirmation and old recording acknowledgements', async () => {
    const recorder = tree!.root.findByType(VoiceRecorder).props;
    act(() => tree!.root.findByType(VoiceNotePlayer).props.onLongPress());
    const confirm = jest.mocked(Alert.alert).mock.calls.at(-1)![2]![1]!.onPress!;
    await act(async () => {
      const replacement = reserveDatasetReplacement();
      replacement.committed();
      replacement.release();
    });
    await act(async () => {
      confirm();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await expect(recorder.onRecorded({ uri: 'file:///synthetic.m4a', durationMs: 1000 })).rejects.toThrow(
        DatasetChangedError,
      );
      await expect(recorder.onDiscarded({ uri: 'file:///synthetic.m4a', durationMs: 1000 })).rejects.toThrow(
        DatasetChangedError,
      );
    });
    expect(t.db.select().from(attachments).get()!.deletedAt).toBeNull();
    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockDiscard).not.toHaveBeenCalled();
    expect(alertError).toHaveBeenCalledWith('وویس حذف نشد', expect.any(DatasetChangedError));
    expect(tree!.root.findAllByType(VoiceRecorder)).toHaveLength(0);
  });
});
