import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { consultations } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { OpenConsults } from './open-consults';
import { createConsult } from './queries';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-sqlite', () => ({ addDatabaseChangeListener: () => ({ remove: () => {} }) }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/ui', () => ({
  Badge: 'Badge',
  Card: 'Card',
  Column: 'Column',
  Row: 'Row',
  SectionHeader: 'SectionHeader',
  Text: 'Text',
}));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
let database: TestDatabase;
let tree: ReactTestRenderer | undefined;
beforeEach(async () => {
  mockPush.mockClear();
  database = useTestDatabase(await createTestDatabase());
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
});
it('opens the exact consult without changing its clinical status', async () => {
  const patientId = await createPatient({ firstName: 'Example', lastName: 'Patient' });
  const consultId = await createConsult({ patientId, reason: 'Example question' });
  await act(async () => {
    tree = create(<OpenConsults />);
    for (let i = 0; i < 35; i++) await Promise.resolve();
  });
  tree!.root
    .findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0]!
    .props.onPress();
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/consult-answer', params: { consultId } });
  expect(database.db.select().from(consultations).get()!.status).toBe('pending');
});
