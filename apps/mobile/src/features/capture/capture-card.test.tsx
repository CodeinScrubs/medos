import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, type AlertButton } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Badge, Button } from '@/components/ui';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase } from '@/test/sqljs';

import { CaptureCard, type PatientAsk } from './capture-card';
import { captureQuery, createCapture, inboxQuery } from './queries';
import { createPatient, deletePatient } from '../patients/queries';
import { taskQuery } from '../tasks/queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/platform/media', () => ({ mediaUri: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');
jest.mock('@/components/voice-note-player', () => ({ VoiceNotePlayer: 'VoiceNotePlayer' }));
jest.mock('@/components/feedback', () => ({
  alertError: jest.fn(),
  notify: jest.requireActual<typeof import('@/components/feedback')>('@/components/feedback').notify,
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {}, radii: {} }) }));
jest.mock('@/components/ui', () => ({
  Badge: 'Badge',
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  Row: 'Row',
  Text: 'Text',
}));

let tree: ReactTestRenderer;
let patientId: string;

beforeEach(async () => {
  useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Example', lastName: 'Patient', status: 'outpatient' });
});

afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
  jest.restoreAllMocks();
});

/** The inbox row as the list hands it over: the patient joined only while still in the record. */
async function renderInboxRow(onAskPatient: (ask: PatientAsk) => void = () => undefined) {
  const [row] = await inboxQuery();
  await act(async () => {
    tree = create(<CaptureCard capture={row!.capture} patient={row!.patient} media={[]} onAskPatient={onAskPatient} />);
  });
  return row!;
}

const button = (label: string) => tree.root.findAllByType(Button).find((b) => b.props.label === label)!;

describe('a capture whose patient was deleted', () => {
  /*
   * The list hides the deleted patient's name, so the card looked patient-less
   * while filing still used the hidden link — and failed with an English
   * "Patient not found". Now the state is visible and the choice is the user's.
   */
  it('says so instead of looking patient-less', async () => {
    await createCapture({ text: 'Call the family', patientId });
    await deletePatient(patientId);
    await renderInboxRow();

    const labels = tree.root.findAllByType(Badge).map((b) => b.props.label);
    expect(labels).toContain('بیمارِ حذف‌شده');
  });

  it('can become a task without a patient, but only after the user says so', async () => {
    const id = await createCapture({ text: 'Call the family', patientId });
    await deletePatient(patientId);
    await renderInboxRow();

    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await act(async () => {
      button('کار').props.onPress();
    });
    // Asked, not done.
    expect(alert).toHaveBeenCalledTimes(1);
    expect(captureQuery(id).get()!.filedAt).toBeNull();

    const choices = alert.mock.calls[0]![2] as AlertButton[];
    await act(async () => {
      choices.find((c) => c.text === 'بدون بیمار')!.onPress!();
    });

    const capture = captureQuery(id).get()!;
    expect(capture.filedAs).toBe('task');
    expect(capture.patientId).toBeNull();
    expect(taskQuery(capture.filedId!).get()!.patientId).toBeNull();
  });

  it('asks which patient before becoming a note', async () => {
    const id = await createCapture({ text: 'Family meeting summary', patientId });
    await deletePatient(patientId);
    const asks: PatientAsk[] = [];
    await renderInboxRow((ask) => asks.push(ask));

    await act(async () => {
      await button('نوت').props.onPress();
    });

    expect(asks).toEqual([{ captureId: id, purpose: 'note', selectedId: null }]);
    expect(captureQuery(id).get()!.filedAt).toBeNull();
  });
});

describe('a capture whose patient is still in the record', () => {
  it('files straight to a task with that patient, without a question', async () => {
    const id = await createCapture({ text: 'Repeat the potassium', patientId });
    await renderInboxRow();

    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await act(async () => {
      button('کار').props.onPress();
    });

    expect(alert).not.toHaveBeenCalled();
    const capture = captureQuery(id).get()!;
    expect(capture.filedAs).toBe('task');
    expect(taskQuery(capture.filedId!).get()!.patientId).toBe(patientId);
    expect(tree.root.findAllByType(Badge).map((b) => b.props.label)).not.toContain('بیمارِ حذف‌شده');
  });
});
