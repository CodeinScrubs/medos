import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PatientRecordScreen } from './patient-record-screen';

let mockParams: { id: string; tab?: string };
let mockUnsaved = false;
const mockFlush = jest.fn<() => Promise<boolean>>();
const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
  setParams: jest.fn((params: { tab: string }) => {
    mockParams = { ...mockParams, ...params };
  }),
};
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
}));
jest.mock('@/db/use-live', () => ({
  useLive: () => ({ data: [{ id: 'patient', firstName: 'Test', lastName: 'Patient' }] }),
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
jest.mock('@/components/feedback', () => ({ alertError: jest.fn() }));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: () => {} }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {}, radii: {} }) }));
jest.mock('./patient-header', () => ({ PatientHeader: 'PatientHeader' }));
jest.mock('./overview-tab', () => ({
  OverviewTab: function Editor() {
    const React = jest.requireActual<typeof import('react')>('react');
    const { useAutosaveScope } =
      jest.requireActual<typeof import('@/components/autosave-scope')>('@/components/autosave-scope');
    const scope = useAutosaveScope()!;
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
beforeEach(async () => {
  jest.clearAllMocks();
  mockParams = { id: 'patient' };
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
