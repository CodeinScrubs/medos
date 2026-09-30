import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { PatientHeader } from './patient-header';
import { createPatient, patientQuery } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/ui', () => ({
  Avatar: 'Avatar',
  Badge: 'Badge',
  Card: 'Card',
  Column: 'Column',
  IconButton: 'IconButton',
  Row: 'Row',
  Text: 'Text',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, radii: {}, spacing: {} }) }));

let tree: ReactTestRenderer | undefined;
let database: TestDatabase;
let patientId: string;
const patient = () => patientQuery(patientId).all()[0]!;
const star = (label: string) =>
  tree!.root.findAll(
    (node) =>
      typeof node.props.onPress === 'function' &&
      (node.props.label === label || node.props.accessibilityLabel === label),
    { deep: false },
  )[0]!;

beforeEach(async () => {
  database = await createTestDatabase();
  useTestDatabase(database);
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Patient' });
  jest.clearAllMocks();
  await act(async () => {
    tree = create(<PatientHeader patient={patient()} />);
  });
});

afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
});

describe('star action on the patient record', () => {
  it('writes to the displayed patient and can be reversed after a refresh', async () => {
    const otherId = await createPatient({ firstName: 'Other', lastName: 'Patient' });
    await act(async () => star('ستاره‌دار کردن').props.onPress());
    expect(patient().starred).toBe(true);
    expect(patientQuery(otherId).all()[0]!.starred).toBe(false);
    await act(async () => tree!.update(<PatientHeader patient={patient()} />));
    await act(async () => star('برداشتن ستاره').props.onPress());
    expect(patient().starred).toBe(false);
    expect(alertError).not.toHaveBeenCalled();
  });

  it('reports a failed SQLite write and leaves the existing flag unchanged', async () => {
    database.sqlite.run(`CREATE TRIGGER reject_star BEFORE UPDATE OF starred ON patients
      BEGIN SELECT RAISE(ABORT, 'synthetic star failure'); END`);
    await act(async () => star('ستاره‌دار کردن').props.onPress());
    expect(patient().starred).toBe(false);
    expect(alertError).toHaveBeenCalledWith('ستاره ثبت نشد', expect.anything());
  });
});
