import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Text } from '@/components/ui';

import { BackupScreen } from './backup-screen';

jest.mock('@/components/ui', () =>
  Object.fromEntries(
    [
      'Badge',
      'Button',
      'Card',
      'Column',
      'Divider',
      'Input',
      'Row',
      'Screen',
      'SectionHeader',
      'Segmented',
      'Text',
      'Toggle',
    ].map((name) => [name, name]),
  ),
);
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/prompt-modal', () => ({ PromptModal: 'PromptModal' }));
jest.mock('@/components/use-now', () => ({ useNow: () => Date.parse('2026-01-01T00:00:00.000Z') }));
jest.mock('@/features/attachments/media-inventory-review', () => ({ MediaInventoryReview: 'MediaInventoryReview' }));
jest.mock('@/db/settings', () => ({
  defineSetting: (key: string, _schema: unknown, value: unknown) => ({ key, defaultValue: value }),
  writeSetting: jest.fn(),
}));
jest.mock('@/db/use-setting', () => ({
  useSetting: (setting: { defaultValue: unknown }) => ({ loaded: true, value: setting.defaultValue }),
}));
jest.mock('@/db/use-live', () => ({
  useLive: () => ({
    data: [
      {
        id: 'synthetic',
        trigger: 'manual',
        status: 'failed',
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        errorText: 'SYNTHETIC_LEGACY_BACKUP_CANARY before params: other',
        sizeBytes: null,
      },
    ],
  }),
}));
jest.mock('./engine', () => ({ backupHistoryQuery: jest.fn(), openBackupFolder: () => null }));
jest.mock('./keys', () => ({
  hasBackupKey: async () => true,
  checkBackupPassphrase: jest.fn(),
  setBackupPassphrase: jest.fn(),
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, radii: {}, spacing: {} }) }));
let tree: ReactTestRenderer;
afterEach(async () => {
  await act(async () => tree?.unmount());
});
describe('legacy backup failure display', () => {
  it('retains the failure row without rendering untrusted persisted text', async () => {
    await act(async () => {
      tree = create(<BackupScreen />);
    });
    const text = tree.root
      .findAllByType(Text)
      .map((node) => node.props.children)
      .join(' ');
    expect(text).not.toContain('SYNTHETIC_LEGACY_BACKUP_CANARY');
    expect(text).toContain('خطای فنی رخ داد؛ دوباره تلاش کنید.');
  });
});
