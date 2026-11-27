import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Text } from '@/components/ui';
import { startDatabase } from '@/db/startup';
import { logError } from '@/platform/error-log';

import { StartupGate } from './startup-gate';

jest.mock('@/components/ui', () => ({ Text: 'Text' }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {} }) }));
jest.mock('@/platform/error-log', () => ({ logError: jest.fn() }));
jest.mock('@/platform/audio', () => ({ prepareAudioForPlayback: async () => {} }));
jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(async () => {}) }));
jest.mock('@/db/startup', () => ({ startDatabase: jest.fn() }));
jest.mock('@/db/audit', () => ({ audit: jest.fn(async () => {}) }));
jest.mock('@/features/backup/engine', () => ({ recoverInterruptedRestore: async () => {} }));
jest.mock('@/features/encounters/status', () => ({ reconcileAllPatientStatuses: async () => 0 }));
jest.mock('@/features/labs/reflag', () => ({ reflagLabValuesIfNeeded: async () => {} }));
jest.mock('@/features/notes/version-queries', () => ({ backfillNoteVersionsIfNeeded: async () => {} }));
jest.mock('@/features/search/reindex', () => ({ reindexSearchIfNeeded: async () => {} }));
let tree: ReactTestRenderer;
afterEach(async () => {
  await act(async () => tree?.unmount());
  jest.resetAllMocks();
});
describe('safe startup failure display', () => {
  it('keeps startup blocked while showing content-free technical context', async () => {
    const error = Object.assign(new Error('SYNTHETIC_STARTUP_CANARY'), { code: 'ERR_INTERNAL_SQLITE_ERROR' });
    error.stack = 'Error: SYNTHETIC_STARTUP_CANARY\n    at start (address at index.android.bundle:1:771)';
    jest.mocked(startDatabase).mockRejectedValueOnce(error);
    await act(async () => {
      tree = create(
        <StartupGate>
          <Text>synthetic ready child</Text>
        </StartupGate>,
      );
    });
    const text = tree.root
      .findAllByType(Text)
      .map((node) => node.props.children)
      .join(' ');
    expect(text).not.toContain('SYNTHETIC_STARTUP_CANARY');
    expect(text).not.toContain('synthetic ready child');
    expect(text).toContain('ERR_INTERNAL_SQLITE_ERROR');
    expect(text).not.toContain('اطلاعات شما پاک نشده');
    expect(logError).toHaveBeenCalledWith(error, { source: 'startup', fatal: true });
  });
});
