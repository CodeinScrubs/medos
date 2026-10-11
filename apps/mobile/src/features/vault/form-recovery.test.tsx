import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AutosaveScope } from '@/components/autosave-scope';
import { alertError } from '@/components/feedback';
import { JalaliDateField } from '@/components/jalali-date-field';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Input } from '@/components/ui';
import { useSaveBeforeLeave } from '@/components/use-save-before-leave';
import { restoreDatabase } from '@/db/client';
import { credentials, workspaceFormDrafts } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import * as workspaceQueries from '@/features/workspace-forms/queries';
import { reserveDatasetReplacement } from '@/lib/dataset-write';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { CredentialFormScreen } from './credential-form-screen';
import { createCredential, credentialQuery } from './queries';

let mockParams: { credentialId?: string; draftId?: string } = {};
let mockFocused = true;
let mockReadError: Error | undefined;
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack }),
}));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({ isFocused: () => mockFocused }) }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[] }) => ({
    data: mockReadError ? undefined : query.all(),
    error: mockReadError,
    retry: jest.fn(),
  }),
}));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: jest.fn() }));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/jalali-date-field', () => ({ JalaliDateField: 'JalaliDateField' }));
jest.mock('@/components/collapsible-section', () => ({
  CollapsibleSection: ({ children }: { children: import('react').ReactNode }) => children,
}));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Input: 'Input',
  Column: 'Column',
  Row: 'Row',
  Card: 'Card',
  Text: 'Text',
  Screen: 'Screen',
  ChipSelect: 'ChipSelect',
  SectionHeader: 'SectionHeader',
  Toggle: 'Toggle',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, radii: {}, spacing: {} }) }));

let tree: ReactTestRenderer | undefined;
let t: TestDatabase;
let background: ((state: import('react-native').AppStateStatus) => void) | undefined;
let snapshotNumber = 0;
const input = (label: string) => tree!.root.findAllByType(Input).find((node) => node.props.label === label)!;
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
async function settle() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
async function press(label: string) {
  await act(async () => {
    button(label).props.onPress();
    await settle();
  });
}
async function mount() {
  await act(async () => {
    tree = create(<CredentialFormScreen />);
    await settle();
  });
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  mockParams = {};
  mockFocused = true;
  mockReadError = undefined;
  mockBack.mockReset();
  jest.mocked(alertError).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    background = listener;
    return { remove: jest.fn() };
  });
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-02T10:00:00Z'));
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  tree = undefined;
  jest.restoreAllMocks();
  jest.useRealTimers();
});
describe('credential raw recovery in the existing form', () => {
  it('recovers an exact whitespace secret and incomplete expiry without publishing on background', async () => {
    await mount();
    const secret = ' \tSynthetic-password\n  ';
    await act(async () => {
      input('رمز').props.onChangeText(secret);
      const date = tree!.root.findByType(JalaliDateField);
      date.props.onRawTextChange?.('1404/13/');
      background?.('background');
      await settle();
    });
    const acknowledged = t.db.select().from(workspaceFormDrafts).get();
    expect(acknowledged).toBeDefined();
    expect(JSON.parse(acknowledged!.body).fields).toMatchObject({ secret, expiresText: '1404/13/' });
    expect(t.db.select().from(credentials).all()).toEqual([]);
    await act(async () => {
      tree!.unmount();
      await settle();
    });
    await mount();
    expect(input('رمز').props.value).toBe(secret);
    expect(tree!.root.findByType(JalaliDateField).props.rawText).toBe('1404/13/');
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('refuses an invalid visible expiry then publishes a corrected secret once without changing native parents', async () => {
    await mount();
    const header = tree!.root.findByType(ScreenOptions);
    const parent = header.parent;
    await act(async () => {
      input('نام سامانه').props.onChangeText('Synthetic portal');
      input('رمز').props.onChangeText('  Synthetic-secret  ');
      tree!.root.findByType(JalaliDateField).props.onRawTextChange('1404/13/');
    });
    await press('ثبت رمز');
    expect(t.db.select().from(credentials).all()).toEqual([]);
    expect(input('رمز').props.value).toBe('  Synthetic-secret  ');
    expect(alertError).toHaveBeenCalled();
    await act(async () => {
      tree!.root.findByType(JalaliDateField).props.onRawTextChange('');
    });
    await press('ثبت رمز');
    expect(t.db.select().from(credentials).all()).toHaveLength(1);
    expect(t.db.select().from(credentials).get()!.secretText).toBe('  Synthetic-secret  ');
    expect(tree!.root.findByType(ScreenOptions)).toBe(header);
    expect(header.parent).toBe(parent);
    expect(input('رمز').props.editable).toBe(false);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('keeps a loaded edit readable after a refresh failure and locks publication until retry', async () => {
    const id = await createCredential({ systemName: 'Synthetic loaded', secret: 'Original synthetic' });
    mockParams = { credentialId: id };
    await mount();
    await act(async () => {
      input('یوزرنیم').props.onChangeText('typed-user');
    });
    const originalInput = input('یوزرنیم');
    await act(async () => {
      mockReadError = new Error('Synthetic read failure');
      tree!.update(<CredentialFormScreen />);
      await settle();
    });
    expect(input('یوزرنیم')).toBe(originalInput);
    expect(input('یوزرنیم').props.value).toBe('typed-user');
    expect(button('ذخیره').props.disabled).toBe(true);
    await press('ذخیره');
    expect((await credentialQuery(id))[0]!.username).toBeNull();
    await act(async () => {
      mockReadError = undefined;
      tree!.update(<CredentialFormScreen />);
      await settle();
    });
    await press('ذخیره');
    expect((await credentialQuery(id))[0]!).toMatchObject({ username: 'typed-user', secretText: 'Original synthetic' });
  });
  it('retains the original dataset across replacement rather than overwriting the replacement password', async () => {
    const id = await createCredential({ systemName: 'Synthetic original', secret: 'Original synthetic' });
    const path = `/credential-${++snapshotNumber}.db`;
    t.sqlite.exec(`VACUUM INTO '${path}'`);
    mockParams = { credentialId: id };
    await mount();
    const originalInput = input('رمز جدید');
    await act(async () => {
      input('رمز جدید').props.onChangeText('  Local synthetic  ');
      background?.('background');
      await settle();
    });
    await act(async () => {
      const replacement = reserveDatasetReplacement();
      const trusted = restoreDatabase(replacement);
      try {
        trusted.sqlite.execSync('PRAGMA foreign_keys = OFF');
        trusted.sqlite.execSync(`ATTACH DATABASE '${path}' AS restore_src`);
        try {
          importTables(trusted.sqlite);
        } finally {
          trusted.sqlite.execSync('DETACH DATABASE restore_src');
          trusted.sqlite.execSync('PRAGMA foreign_keys = ON');
        }
        replacement.committed();
      } finally {
        replacement.release();
      }
      tree!.update(<CredentialFormScreen />);
      await settle();
    });
    expect(input('رمز جدید')).toBe(originalInput);
    expect(input('رمز جدید').props.value).toBe('  Local synthetic  ');
    expect(input('رمز جدید').props.editable).toBe(false);
    expect((await credentialQuery(id))[0]!.secretText).toBe('Original synthetic');
    expect(t.db.select().from(workspaceFormDrafts).all()).toEqual([]);
    await press('بستن');
    const confirmation = jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
    await act(async () => {
      confirmation[1]!.onPress!();
      await settle();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect((await credentialQuery(id))[0]!.secretText).toBe('Original synthetic');
  });
  it('does not pop a newer route after delayed publication acknowledgment', async () => {
    const publish = jest.spyOn(workspaceQueries, 'publishWorkspaceDraft');
    const actual = publish.getMockImplementation()!;
    let acknowledge!: () => void;
    publish.mockImplementation(async (...args) => {
      const id = await actual(...args);
      await new Promise<void>((resolve) => {
        acknowledge = resolve;
      });
      return id;
    });
    await mount();
    await act(async () => {
      input('نام سامانه').props.onChangeText('Synthetic deferred');
    });
    await act(async () => {
      button('ثبت رمز').props.onPress();
      await settle();
    });
    expect(t.db.select().from(credentials).all()).toHaveLength(1);
    await act(async () => {
      mockFocused = false;
      acknowledge();
      await settle();
    });
    expect(mockBack).not.toHaveBeenCalled();
    expect(input('نام سامانه').props.editable).toBe(false);
    await act(async () => {
      mockFocused = true;
      button('بستن').props.onPress();
      await settle();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(t.db.select().from(credentials).all()).toHaveLength(1);
  });
  it('flushes raw input through exactly one unconditional route-removal guard', async () => {
    jest.mocked(useSaveBeforeLeave).mockClear();
    await mount();
    expect(tree!.root.findAllByType(AutosaveScope)).toHaveLength(1);
    await act(async () => {
      input('رمز').props.onChangeText(' \t');
    });
    const guard = jest.mocked(useSaveBeforeLeave).mock.calls.at(-1)![0];
    let flushed = false;
    await act(async () => {
      flushed = await guard();
      await settle();
    });
    expect(flushed).toBe(true);
    expect(new Set(jest.mocked(useSaveBeforeLeave).mock.calls.map(([flush]) => flush)).size).toBe(1);
    expect(JSON.parse(t.db.select().from(workspaceFormDrafts).get()!.body).fields.secret).toBe(' \t');
    expect(t.db.select().from(credentials).all()).toEqual([]);
  });
});
