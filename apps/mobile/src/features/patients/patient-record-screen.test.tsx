import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { useAutosaveScope } from '@/components/autosave-scope';
import { alertError } from '@/components/feedback';
import { ScreenOptions } from '@/components/screen-options';
import { Button, IconButton } from '@/components/ui';
import { DatasetBusyError, DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';

import { PatientRecordScreen } from './patient-record-screen';
import { deletePatient } from './queries';

let mockParams: { id: string; tab?: string };
let mockUnsaved = false;
let mockRows: { id: string; firstName: string; lastName: string }[] | undefined = [];
let mockFocused = true;
let mockScope: NonNullable<ReturnType<typeof useAutosaveScope>>;
const mockFlush = jest.fn<() => Promise<boolean>>();
const mockDispatch = jest.fn();
const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
  setParams: jest.fn((params: { tab: string }) => {
    mockParams = { ...mockParams, ...params };
  }),
  replace: jest.fn(),
};
jest.mock('expo-router/react-navigation', () => ({
  useNavigation: () => ({
    isFocused: () => mockFocused,
    getState: () => ({ key: 'patient-stack' }),
    dispatch: mockDispatch,
  }),
  StackActions: { replace: (name: string, params: object) => ({ type: 'REPLACE', payload: { name, params } }) },
}));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
  useRoute: () => ({ key: 'patient-route', name: 'patient/[id]/index', params: mockParams }),
}));
jest.mock('@/db/use-live', () => ({
  useLive: () => ({ data: mockRows }),
}));
jest.mock('./queries', () => ({ patientQuery: () => null, deletePatient: jest.fn() }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Column: 'Column',
  EmptyState: 'EmptyState',
  IconButton: 'IconButton',
  Row: 'Row',
  Screen: 'Screen',
  Text: 'Text',
}));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({
  alertError: jest.fn(),
  notify: jest.requireActual<typeof import('@/components/feedback')>('@/components/feedback').notify,
}));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: () => {} }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {}, radii: {} }) }));
jest.mock('./patient-header', () => ({ PatientHeader: 'PatientHeader' }));
jest.mock('./overview-tab', () => ({
  OverviewTab: function Editor() {
    const React = jest.requireActual<typeof import('react')>('react');
    const { useAutosaveScope } =
      jest.requireActual<typeof import('@/components/autosave-scope')>('@/components/autosave-scope');
    const scope = useAutosaveScope()!;
    mockScope = scope;
    React.useEffect(
      () =>
        scope.group.register({
          get unsaved() {
            return mockUnsaved;
          },
          flush: mockFlush,
        }),
      [scope],
    );
    return React.createElement('DraftEditor', { value: 'Unfinished text' });
  },
}));
jest.mock('@/features/timeline/timeline-tab', () => ({ TimelineTab: 'TimelineTab' }));
jest.mock('@/features/notes/notes-tab', () => ({ NotesTab: 'NotesTab' }));
jest.mock('@/features/kardex/kardex-tab', () => ({ KardexTab: 'KardexTab' }));
jest.mock('@/features/vitals/vitals-tab', () => ({ VitalsTab: 'VitalsTab' }));
jest.mock('@/features/labs/labs-tab', () => ({ LabsTab: 'LabsTab' }));
jest.mock('@/features/imaging/imaging-tab', () => ({ ImagingTab: 'ImagingTab' }));
jest.mock('@/features/attachments/media-tab', () => ({ MediaTab: 'MediaTab' }));

let tree: ReactTestRenderer;
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
async function refresh() {
  await act(async () => {
    tree.update(<PatientRecordScreen />);
    await settle();
  });
}
const shown = (name: string) => tree.root.findAll((node) => node.type === name).length > 0;
function replaceDataset() {
  const replacement = reserveDatasetReplacement();
  replacement.committed();
  replacement.release();
}
function headerAction(label: string) {
  const header = tree.root.findByType(ScreenOptions).props.options.headerRight();
  const children = header.props.children as { type: unknown; props: { label: string; onPress(): void } }[];
  return children.find((child) => child.type === IconButton && child.props.label === label)!.props.onPress;
}
async function askRenew() {
  await act(async () => {
    tree.root
      .findAllByType(Button)
      .find((node) => node.props.label === 'شروع تازه')!
      .props.onPress();
  });
  return jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
}
beforeEach(async () => {
  jest.clearAllMocks();
  mockParams = { id: 'patient' };
  mockRows = [{ id: 'patient', firstName: 'Test', lastName: 'Patient' }];
  mockFocused = true;
  mockUnsaved = false;
  mockFlush.mockResolvedValue(true);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await act(async () => {
    tree = create(<PatientRecordScreen />);
  });
});
afterEach(async () => {
  await act(async () => {
    tree.unmount();
  });
  jest.restoreAllMocks();
});

describe('patient tab navigation', () => {
  it.each([undefined, []])('offers explicit renewal when restore precedes any patient seed (%s)', async (initial) => {
    await act(async () => tree.unmount());
    mockRows = initial;
    await act(async () => {
      tree = create(<PatientRecordScreen />);
      await settle();
    });
    await act(async () => replaceDataset());
    mockRows = [{ id: 'patient', firstName: 'Restored', lastName: 'Patient' }];
    await refresh();
    const choices = await askRenew();
    await act(async () => choices.find((choice) => choice.text === 'شروع تازه')!.onPress?.());
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('never lets callbacks from a cancelled renewal consume a later dialog', async () => {
    await act(async () => replaceDataset());
    const old = await askRenew();
    await act(async () => old.find((choice) => choice.text === 'مرور نوشته‌ها')!.onPress?.());
    const fresh = await askRenew();
    await act(async () => {
      old.find((choice) => choice.text === 'شروع تازه')!.onPress?.();
      old.find((choice) => choice.text === 'مرور نوشته‌ها')!.onPress?.();
    });
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockScope.isAbandoned()).toBe(false);
    await act(async () => fresh.find((choice) => choice.text === 'شروع تازه')!.onPress?.());
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('keeps unregistered/pending local editors when the restored patient is absent, until explicit renewal', async () => {
    await act(async () => replaceDataset());
    mockRows = [];
    await refresh();
    expect(shown('DraftEditor')).toBe(true);
    expect(mockDispatch).not.toHaveBeenCalled();
    let choices = await askRenew();
    await act(async () => choices.find((choice) => choice.text === 'مرور نوشته‌ها')!.onPress?.());
    expect(shown('DraftEditor')).toBe(true);
    expect(mockDispatch).not.toHaveBeenCalled();
    choices = await askRenew();
    mockFlush.mockClear();
    await act(async () => choices.find((choice) => choice.text === 'شروع تازه')!.onPress?.());
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'REPLACE',
      payload: { name: 'patient/[id]/index', params: { id: 'patient', tab: 'overview' } },
      source: 'patient-route',
      target: 'patient-stack',
    });
    expect(mockFlush).not.toHaveBeenCalled();
    expect(mockScope.isAbandoned()).toBe(true);
    await act(async () => choices.find((choice) => choice.text === 'شروع تازه')!.onPress?.());
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('does not renew through a confirmation captured before another dataset replacement', async () => {
    await act(async () => replaceDataset());
    const choices = await askRenew();
    await act(async () => {
      replaceDataset();
      choices.find((choice) => choice.text === 'شروع تازه')!.onPress?.();
    });
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockScope.isAbandoned()).toBe(false);
    expect(alertError).toHaveBeenCalledWith('صفحه تازه نشد', expect.any(DatasetChangedError));
  });

  it('does not replace another active route through a delayed renewal confirmation', async () => {
    await act(async () => replaceDataset());
    const choices = await askRenew();
    mockFocused = false;
    await act(async () => choices.find((choice) => choice.text === 'شروع تازه')!.onPress?.());
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockScope.isAbandoned()).toBe(false);
    mockFocused = true;
    const fresh = await askRenew();
    await act(async () => fresh.find((choice) => choice.text === 'شروع تازه')!.onPress?.());
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('ignores renewal confirmation after its originating workspace unmounts', async () => {
    await act(async () => replaceDataset());
    const choices = await askRenew();
    await act(async () => tree.unmount());
    await act(async () => choices.find((choice) => choice.text === 'شروع تازه')!.onPress?.());
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('rejects old header/delete actions after renewal while a newly mounted route can edit', async () => {
    const edit = headerAction('ویرایش');
    await act(async () => headerAction('حذف')());
    const remove = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((choice) => choice.text === 'حذف')!;
    await act(async () => replaceDataset());
    const choices = await askRenew();
    await act(async () => choices.find((choice) => choice.text === 'شروع تازه')!.onPress?.());
    await act(async () => {
      tree.unmount();
      tree = create(<PatientRecordScreen />);
      await settle();
    });
    await act(async () => {
      edit();
      remove.onPress?.();
      await settle();
    });
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(deletePatient).not.toHaveBeenCalled();
    await act(async () => {
      headerAction('ویرایش')();
      await settle();
    });
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/patient/[id]/edit', params: { id: 'patient' } });
  });

  it('keeps the old tab when a deep link changes it after replacement', async () => {
    await act(async () => replaceDataset());
    mockFlush.mockClear();
    mockParams.tab = 'notes';
    await refresh();
    expect(shown('DraftEditor')).toBe(true);
    expect(shown('NotesTab')).toBe(false);
    expect(mockFlush).not.toHaveBeenCalled();
  });

  it('holds write admission through an awaited scoped action', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const action = jest.fn(() => pending);
    let operation!: Promise<void>;
    await act(async () => {
      operation = mockScope.perform(action);
      await settle();
    });
    let refused = false;
    try {
      const replacement = reserveDatasetReplacement();
      replacement.release();
    } catch (error) {
      refused = error instanceof DatasetBusyError;
    }
    await act(async () => {
      finish();
      await operation;
    });
    expect(refused).toBe(true);
    const replacement = reserveDatasetReplacement();
    replacement.release();
  });

  it('keeps the editor mounted when a changed route tab cannot save its fields', async () => {
    mockUnsaved = true;
    mockFlush.mockResolvedValue(false);
    mockParams.tab = 'notes';
    await refresh();
    expect(mockFlush).toHaveBeenCalled();
    expect(shown('DraftEditor')).toBe(true);
    expect(shown('NotesTab')).toBe(false);
  });

  it('waits for the pending save before following the new route tab', async () => {
    let finish!: (saved: boolean) => void;
    mockUnsaved = true;
    mockFlush.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mockParams.tab = 'notes';
    await refresh();
    expect(shown('DraftEditor')).toBe(true);
    await act(async () => {
      mockUnsaved = false;
      finish(true);
      await settle();
    });
    expect(shown('NotesTab')).toBe(true);
  });

  it('keeps manual tabs in the URL so the same linked tab can be opened again', async () => {
    mockParams.tab = 'notes';
    await refresh();
    const timeline = tree.root
      .findAll((node) => node.props.accessibilityRole === 'tab' && typeof node.props.onPress === 'function')
      .find((node) => node.findAll((child) => child.props.children === 'روند').length)!;
    await act(async () => {
      timeline.props.onPress();
      await settle();
    });
    expect(mockRouter.setParams).toHaveBeenCalledWith({ tab: 'timeline' });
    await refresh();
    mockParams.tab = 'notes';
    await refresh();
    expect(shown('NotesTab')).toBe(true);
  });
});
