import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Input } from '@/components/ui';
import { ConsultAnswerScreen } from '@/features/consults/answer-screen';
import { createConsult } from '@/features/consults/queries';
import { DischargeScreen } from '@/features/encounters/discharge-screen';
import { EncounterFormScreen } from '@/features/encounters/encounter-form-screen';
import { openEncounter } from '@/features/encounters/queries';
import { FollowUpFormScreen } from '@/features/followups/follow-up-form-screen';
import { EditPatientScreen } from '@/features/patients/edit-patient-screen';
import { NewPatientScreen } from '@/features/patients/new-patient-screen';
import { createPatient } from '@/features/patients/queries';
import { databaseRows, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

let mockPatientId: string;
let mockEncounterId: string;
let mockConsultId: string;
let mockWaiting: boolean;
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: mockPatientId, encounterId: mockEncounterId, consultId: mockConsultId }),
  useRouter: () => ({ back: jest.fn() }),
}));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown }) => ({
    data: mockWaiting ? undefined : query.all(),
    error: undefined,
    retry: jest.fn(),
  }),
}));
jest.mock('@/components/ui', () =>
  Object.fromEntries(
    [
      'Button',
      'Card',
      'ChipSelect',
      'Column',
      'Field',
      'Input',
      'Row',
      'Screen',
      'Segmented',
      'SelectField',
      'Text',
      'Toggle',
    ].map((name) => [name, name]),
  ),
);
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: () => {} }));
jest.mock('@/components/use-now', () => ({ useNow: () => new Date('2026-10-01T12:00:00Z').getTime() }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/picker-modal', () => ({ PickerModal: 'PickerModal' }));
jest.mock('@/components/collapsible-section', () => ({ CollapsibleSection: 'CollapsibleSection' }));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {} }) }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let tree: ReactTestRenderer | undefined;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  mockPatientId = await createPatient({ firstName: 'Synthetic', lastName: 'Gate' });
  mockEncounterId = await openEncounter({
    patientId: mockPatientId,
    kind: 'admission',
    admittedAt: new Date('2026-10-01T11:00:00Z'),
  });
  mockConsultId = await createConsult({ patientId: mockPatientId, reason: 'Synthetic question' });
  mockWaiting = true;
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
});

describe('form authority before the first read', () => {
  it('retains actual loaded patient input when the restored archive omits that patient', async () => {
    const emptyArchive = await createTestDatabase();
    const replace = snapshotDataset(emptyArchive); // The live client remains on t.
    mockWaiting = false;
    await act(async () => {
      tree = create(<EditPatientScreen />);
    });
    const firstName = tree!.root.findAllByType(Input).find((node) => node.props.label === 'نام')!;
    await act(async () => firstName.props.onChangeText('Retained missing patient'));
    await act(async () => {
      replace();
      tree!.update(<EditPatientScreen />);
    });
    const before = databaseRows(t);
    const retained = tree!.root.findAllByType(Input).find((node) => node.props.label === 'نام');
    expect(retained?.props.value).toBe('Retained missing patient');
    expect(databaseRows(t)).toEqual(before);
  });
  it.each([
    { name: 'patient edit', Screen: EditPatientScreen },
    { name: 'new patient', Screen: NewPatientScreen },
    { name: 'admission edit', Screen: EncounterFormScreen },
    { name: 'discharge', Screen: DischargeScreen },
    { name: 'follow-up', Screen: FollowUpFormScreen },
    { name: 'consult answer', Screen: ConsultAnswerScreen },
  ])('does not give a waiting $name gate fresh authority after replacement', async ({ Screen }) => {
    await act(async () => {
      tree = create(<Screen />);
    });
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    await act(async () => snapshotDataset(t)());
    const before = databaseRows(t);
    mockWaiting = false;
    await act(async () => tree!.update(<Screen />));
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    expect(databaseRows(t)).toEqual(before);
    // A deliberately new route is allowed to read the replacement dataset.
    await act(async () => tree!.unmount());
    await act(async () => {
      tree = create(<Screen />);
    });
    expect(tree!.root.findAllByType(Input).length).toBeGreaterThan(0);
  });
});
