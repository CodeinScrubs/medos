import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { cloneElement, type ReactElement, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { PickerModal } from '@/components/picker-modal';
import { Badge, Button, EmptyState, Input, SectionHeader, Text } from '@/components/ui';
import { tablesOf } from '@/db/query-tables';
import { datasetGeneration } from '@/lib/dataset-write';
import { SaveGroup } from '@/lib/save-before-leave';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase } from '@/test/sqljs';

import { CaptureCard } from './capture/capture-card';
import { InboxSection } from './capture/inbox-section';
import * as captures from './capture/queries';
import { ConsultsSection } from './consults/consults-section';
import { OpenConsults } from './consults/open-consults';
import { openConsultsQuery, createConsult, patientConsultsQuery } from './consults/queries';
import { DiagnosesSection } from './diagnoses/diagnoses-section';
import { patientDiagnosesQuery } from './diagnoses/queries';
import { upcomingOccasionsQuery } from './doctors/occasions-queries';
import { UpcomingOccasions } from './doctors/upcoming-occasions';
import { activeEncounterDetailQuery, currentEncounterQuery, openEncounter } from './encounters/queries';
import { FollowUpCard } from './followups/follow-up-card';
import { createFollowUp, dueFollowUpsQuery, patientFollowUpsQuery } from './followups/queries';
import { createOrder, patientOrdersQuery } from './kardex/queries';
import { createLabPanel, patientLabPanelsQuery, patientLabValuesQuery } from './labs/queries';
import { openNoteDraftsQuery } from './notes/draft-queries';
import { createNote, latestPatientNoteQuery } from './notes/queries';
import { UnfinishedNotes } from './notes/unfinished-notes';
import { OverviewTab } from './patients/overview-tab';
import { PatientCard } from './patients/patient-card';
import { PatientSnapshot } from './patients/patient-snapshot';
import {
  addPatientContact,
  createPatient,
  patientContactsQuery,
  patientListQuery,
  patientQuery,
} from './patients/queries';
import {
  activeShiftQuery,
  activeShiftWorkspaceQuery,
  addPatientToShift,
  shiftPatientsQuery,
  startShift,
} from './shifts/queries';
import * as shiftQueries from './shifts/queries';
import { RoundScreen } from './shifts/round-screen';
import { ShiftCard } from './shifts/shift-card';
import { ShiftScreen } from './shifts/shift-screen';
import { taskCountQuery } from './tasks/queries';
import { TasksSection } from './tasks/tasks-section';
import { TimelineTab } from './timeline/timeline-tab';
import { TodayScreen } from './today/today-screen';

// Real migrated SQLite queries and screen handlers; use-live.test separately
// exercises subscription, retry and async lifecycle behavior. This stand-in
// injects read failures and retains the previous rows, just like the real hook.
const mockCache = new Map<string, unknown[]>();
const mockErrors = new Map<string, Error>();
const mockLoading = new Set<string>();
const mockRetried: string[] = [];
let mockNow = new Date('2026-09-25T12:00:00Z').getTime();
const mockScope = {
  perform: (action: () => void) => action(),
  group: new SaveGroup(),
  generation: datasetGeneration(),
};
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[]; toSQL(): unknown }) => {
    const { tablesOf: tables } = jest.requireActual<typeof import('@/db/query-tables')>('@/db/query-tables');
    const watched = tables(query);
    const table = watched[0]!;
    const key = JSON.stringify(query.toSQL());
    const failed = watched.find((name) => mockErrors.has(name));
    const error = failed ? mockErrors.get(failed) : undefined;
    if (!error && !watched.some((name) => mockLoading.has(name))) {
      const rows = query.all();
      if (JSON.stringify(rows) !== JSON.stringify(mockCache.get(key))) mockCache.set(key, rows);
    }
    const data = mockCache.get(key);
    return {
      data,
      error,
      loading: data === undefined && !error,
      retry: () => {
        mockRetried.push(failed ?? table);
        if (failed) mockErrors.delete(failed);
      },
    };
  },
}));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/platform/media', () => ({}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), setParams: jest.fn() }) }));
jest.mock('@/components/ui', () => ({
  Badge: 'Badge',
  Button: 'Button',
  Card: 'Card',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  DataRow: 'DataRow',
  Divider: 'Divider',
  EmptyState: 'EmptyState',
  Fab: 'Fab',
  Input: 'Input',
  IconButton: 'IconButton',
  Row: 'Row',
  Screen: 'Screen',
  SectionHeader: 'SectionHeader',
  Text: 'Text',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {}, radii: {} }) }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/picker-modal', () => ({ PickerModal: 'PickerModal' }));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: () => null }));
jest.mock('react-native-keyboard-controller', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/components/feedback', () => ({
  alertError: jest.fn(),
  notify: jest.requireActual<typeof import('@/components/feedback')>('@/components/feedback').notify,
}));
jest.mock('@/components/use-now', () => ({ useNow: () => mockNow }));
jest.mock('@/components/prompt-modal', () => ({ PromptModal: 'PromptModal' }));
jest.mock('@/components/autosave-scope', () => ({
  AutosaveScope: ({ children }: { children: ReactNode }) => children,
  useAutosaveScope: () => mockScope,
}));
jest.mock('./backup/restore-trouble', () => ({ RestoreTrouble: 'RestoreTrouble' }));
jest.mock('./calls/recent-calls-card', () => ({ RecentCallsCard: 'RecentCallsCard' }));
jest.mock('./capture/capture-card', () => ({ CaptureCard: 'CaptureCard', groupMedia: () => new Map(), NO_MEDIA: [] }));
jest.mock('./patients/patient-card', () => ({ PatientCard: 'PatientCard' }));
jest.mock('./followups/follow-up-card', () => ({ FollowUpCard: 'FollowUpCard' }));
jest.mock('./tasks/quick-add', () => ({ QuickAddTask: 'QuickAddTask' }));
jest.mock('./tasks/task-row', () => ({ TaskRow: 'TaskRow' }));
jest.mock('./consults/request-editor', () => ({ ConsultRequestEditor: 'ConsultRequestEditor' }));

let tree: ReactTestRenderer;
let patientId: string;
const tableOf = (query: unknown) => tablesOf(query)[0]!;
function fail(query: unknown) {
  mockErrors.set(tableOf(query), new Error('Synthetic read failure'));
}
async function render(element: ReactElement) {
  await act(async () => {
    tree = create(element);
  });
}
async function refresh(element: ReactElement) {
  await act(async () => {
    tree.update(cloneElement(element));
  });
}
const notices = () => tree.root.findAllByType(ErrorNotice).filter((node) => node.props.error);
const text = () =>
  tree.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .flat()
    .join(' ');
async function retryAll() {
  await act(async () => {
    notices().forEach((node) => node.props.onRetry());
  });
}

beforeEach(async () => {
  mockNow = new Date('2026-09-25T12:00:00Z').getTime();
  mockScope.generation = datasetGeneration();
  useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Example', lastName: 'Patient', status: 'outpatient' });
  mockCache.clear();
  mockErrors.clear();
  mockLoading.clear();
  mockRetried.length = 0;
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
  jest.restoreAllMocks();
});

describe('patient overview read recovery', () => {
  const header = (title: string) => tree.root.findAllByType(SectionHeader).find((node) => node.props.title === title)!;
  const overview = async () => <OverviewTab patient={(await patientQuery(patientId))[0]!} />;
  const sources = () => [
    { query: patientFollowUpsQuery(patientId), title: 'پیگیری‌ها', empty: 'پیگیری بازی نیست.', element: overview },
    {
      query: patientContactsQuery(patientId),
      title: 'همراهان',
      empty: 'شماره‌ی همراه ثبت نشده است.',
      element: overview,
    },
    {
      query: patientDiagnosesQuery(patientId),
      title: 'تشخیص‌ها',
      empty: 'هنوز تشخیصی ثبت نشده.',
      element: async () => <DiagnosesSection patientId={patientId} />,
    },
    {
      query: patientConsultsQuery(patientId),
      title: 'کانسالت‌ها',
      empty: 'کانسالتی ثبت نشده.',
      element: async () => <ConsultsSection patientId={patientId} />,
    },
  ];

  it.each([0, 1, 2, 3])(
    'does not present cached-empty source %i as a successful empty read after failure',
    async (index) => {
      const { query, title, empty, element } = sources()[index]!;
      const screen = await element();
      await render(screen);
      expect(text()).toContain(empty);
      fail(query);
      await refresh(screen);
      expect(text()).not.toContain(empty);
      expect(header(title).props.count).toBeUndefined();
      const notice = notices().find((node) => node.props.what === title)!;
      expect(notice).toBeDefined();
      expect(typeof notice.props.onRetry).toBe('function');
      await act(async () => notice.props.onRetry());
      await refresh(screen);
      expect(header(title).props.count).toBe(0);
      expect(text()).toContain(empty);
    },
  );

  it.each([0, 1, 2, 3])('does not report zero for source %i before it has loaded', async (index) => {
    const { query, title, empty, element } = sources()[index]!;
    mockLoading.add(tableOf(query));
    await render(await element());
    expect(header(title).props.count).toBeUndefined();
    expect(text()).not.toContain(empty);
  });

  it('retains loaded follow-ups and contacts while exposing their independent read failures', async () => {
    await createFollowUp({
      patientId,
      dueAt: new Date('2026-09-26T12:00:00Z'),
      reason: 'Synthetic pending follow-up',
      channel: 'call',
      priority: 'normal',
    });
    await addPatientContact(patientId, { name: 'Synthetic companion', phone: '0000000027' });
    const screen = await overview();
    await render(screen);
    fail(patientFollowUpsQuery(patientId));
    fail(patientContactsQuery(patientId));
    await refresh(screen);
    expect(tree.root.findByType(FollowUpCard).props.followUp.reason).toBe('Synthetic pending follow-up');
    expect(text()).toContain('Synthetic companion');
    expect(header('پیگیری‌ها').props.count).toBeUndefined();
    expect(header('همراهان').props.count).toBeUndefined();
    expect(notices().filter((node) => ['پیگیری‌ها', 'همراهان'].includes(node.props.what))).toHaveLength(2);
  });

  it('does not suggest an absent admission while its first read is loading or has failed', async () => {
    const query = activeEncounterDetailQuery(patientId);
    mockLoading.add(tableOf(query));
    const screen = await overview();
    await render(screen);
    expect(tree.root.findAllByType(Button).some((node) => node.props.label === 'ثبت بستری / ویزیت')).toBe(false);
    mockLoading.clear();
    fail(query);
    await refresh(screen);
    expect(notices().some((node) => node.props.what === 'بستری / ویزیت')).toBe(true);
    expect(tree.root.findAllByType(Button).some((node) => node.props.label === 'ثبت بستری / ویزیت')).toBe(false);
    await retryAll();
    await refresh(screen);
    expect(tree.root.findAllByType(Button).some((node) => node.props.label === 'ثبت بستری / ویزیت')).toBe(true);
  });

  it('keeps a loaded admission visible after a failed refresh and offers retry', async () => {
    await openEncounter({ patientId, kind: 'admission', ward: 'Synthetic ward' });
    const screen = await overview();
    await render(screen);
    fail(activeEncounterDetailQuery(patientId));
    await refresh(screen);
    expect(text()).toContain('Synthetic ward');
    const notice = notices().find((node) => node.props.what === 'بستری / ویزیت')!;
    expect(notice).toBeDefined();
    expect(typeof notice.props.onRetry).toBe('function');
  });

  it('updates elapsed admission time from the shared clock without changing the recorded admission', async () => {
    const id = await openEncounter({ patientId, kind: 'admission', admittedAt: new Date('2026-09-25T11:00:00Z') });
    const screen = await overview();
    await render(screen);
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === '۱ ساعت')).toBe(true);
    mockNow += 3_600_000;
    await refresh(screen);
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === '۲ ساعت')).toBe(true);
    expect((await currentEncounterQuery(patientId))[0]!.id).toBe(id);
    expect((await currentEncounterQuery(patientId))[0]!.admittedAt!.toISOString()).toBe('2026-09-25T11:00:00.000Z');
  });

  it('keeps important notes visible with their own failure and retry feedback', async () => {
    await createNote({ patientId, type: 'event', title: 'Synthetic important event', body: 'Synthetic event body' });
    const screen = await overview();
    await render(screen);
    fail(latestPatientNoteQuery(patientId));
    await refresh(screen);
    expect(text()).toContain('Synthetic important event');
    const notice = notices().find((node) => node.props.what === 'رویدادهای مهم')!;
    expect(notice).toBeDefined();
    expect(typeof notice.props.onRetry).toBe('function');
  });

  it('retains partially typed clinical input through failed refresh and retry', async () => {
    const screen = <DiagnosesSection patientId={patientId} />;
    await render(screen);
    await act(async () => tree.root.findByType(Input).props.onChangeText('Synthetic partial impression'));
    fail(patientDiagnosesQuery(patientId));
    await refresh(screen);
    expect(tree.root.findByType(Input).props.value).toBe('Synthetic partial impression');
    const notice = notices().find((node) => node.props.what === 'تشخیص‌ها')!;
    expect(typeof notice.props.onRetry).toBe('function');
    await act(async () => notice.props.onRetry());
    await refresh(screen);
    expect(tree.root.findByType(Input).props.value).toBe('Synthetic partial impression');
  });

  it('does not silently hide a failed encounter read in the clinical snapshot', async () => {
    fail(currentEncounterQuery(patientId));
    await render(<PatientSnapshot patientId={patientId} />);
    expect(notices()).toHaveLength(1);
    expect(typeof notices()[0]!.props.onRetry).toBe('function');
    await retryAll();
    await refresh(<PatientSnapshot patientId={patientId} />);
    expect(notices()).toHaveLength(0);
  });

  it('offers explicit recovery for a failed snapshot order read', async () => {
    fail(patientOrdersQuery(patientId, null));
    await render(<PatientSnapshot patientId={patientId} />);
    expect(notices()).toHaveLength(1);
    expect(typeof notices()[0]!.props.onRetry).toBe('function');
    await retryAll();
    await refresh(<PatientSnapshot patientId={patientId} />);
    expect(notices()).toHaveLength(0);
  });

  it('does not present cached unflagged labs as a current successful summary after a failed refresh', async () => {
    await createLabPanel({
      patientId,
      collectedAt: new Date('2026-09-25T11:00:00Z'),
      source: 'manual',
      values: [{ analyte: 'Synthetic lab', value: '1', unit: 'mg/dL', refLow: 0, refHigh: 2 }],
    });
    const screen = <PatientSnapshot patientId={patientId} />;
    await render(screen);
    expect(text()).toContain('بدون H یا L');
    fail(patientLabValuesQuery(patientId));
    await refresh(screen);
    expect(text()).not.toContain('بدون H یا L');
    expect(text()).toContain('نتایج قبلی');
    await retryAll();
    await refresh(screen);
    expect(text()).toContain('بدون H یا L');
    expect(mockRetried).toEqual(['lab_values']);
  });

  it('keeps cached orders without claiming a current total and retries only the failed source', async () => {
    await createOrder({ patientId, kind: 'drug', name: 'Synthetic cached order' });
    const screen = <PatientSnapshot patientId={patientId} />;
    await render(screen);
    expect(text()).toContain('دستور جاری');
    fail(patientOrdersQuery(patientId, null));
    await refresh(screen);
    expect(text()).toContain('Synthetic cached order');
    expect(text()).not.toContain('دستور جاری');
    await retryAll();
    await refresh(screen);
    expect(text()).toContain('دستور جاری');
    expect(mockRetried).toEqual(['orders']);
  });
});

describe('Today read failures', () => {
  it('uses unknown counters during loading and errors, and zero only after successful empty reads', async () => {
    mockLoading.add(tableOf(patientListQuery()));
    mockLoading.add(tableOf(dueFollowUpsQuery()));
    await render(<TodayScreen />);
    const counters = () =>
      tree.root
        .findAllByType(Text)
        .filter((n) => n.props.variant === 'title')
        .map((n) => n.props.children);
    expect(counters()).toEqual(['—', '—', '—']);
    expect(tree.root.findAllByType(EmptyState)).toHaveLength(0);
    mockLoading.clear();
    fail(patientListQuery());
    fail(dueFollowUpsQuery());
    await refresh(<TodayScreen />);
    expect(counters()).toEqual(['—', '—', '—']);
    expect(tree.root.findAllByType(EmptyState)).toHaveLength(0);
    await retryAll();
    await refresh(<TodayScreen />);
    expect(counters()).toEqual(['۰', '۰', '۰']);
    expect(tree.root.findByType(EmptyState).props.title).toBe('بیمار بستری یا پیگیری ثبت‌شده‌ای نیست');
    fail(dueFollowUpsQuery());
    await refresh(<TodayScreen />);
    expect(tree.root.findAllByType(EmptyState)).toHaveLength(0);
    expect(text()).not.toContain('برای امروز پیگیری‌ای نمانده');
  });

  it('keeps loaded patients visible while hiding an unreliable count', async () => {
    await openEncounter({ patientId, kind: 'admission', admittedAt: new Date('2026-09-24T12:00:00Z') });
    await render(<TodayScreen />);
    expect(tree.root.findAllByType(PatientCard)).toHaveLength(1);
    fail(patientListQuery());
    await refresh(<TodayScreen />);
    expect(tree.root.findAllByType(PatientCard)).toHaveLength(1);
    expect(
      tree.root.findAllByType(SectionHeader).find((n) => n.props.title === 'بیماران بستری')!.props.count,
    ).toBeUndefined();
    expect(notices().length).toBeGreaterThan(0);
  });

  it.each(['occasions', 'consults', 'drafts'] as const)(
    'shows %s initial errors and explicit recovery',
    async (kind) => {
      const choices = {
        occasions: {
          query: upcomingOccasionsQuery(),
          element: <UpcomingOccasions now={new Date('2026-09-25T12:00:00Z')} />,
        },
        consults: { query: openConsultsQuery(), element: <OpenConsults /> },
        drafts: { query: openNoteDraftsQuery(), element: <UnfinishedNotes /> },
      };
      const { query, element } = choices[kind];
      fail(query);
      await render(element);
      expect(notices()).toHaveLength(1);
      expect(tree.root.findByType(SectionHeader).props.count).toBeUndefined();
      await retryAll();
      await refresh(element);
      expect(mockRetried).toEqual([tableOf(query)]);
      expect(tree.toJSON()).toBeNull();
    },
  );

  it('keeps cached unanswered consults after refresh failure', async () => {
    await createConsult({ patientId, reason: 'Example question' });
    await render(<OpenConsults />);
    fail(openConsultsQuery());
    await refresh(<OpenConsults />);
    expect(text()).toContain('Example question');
    expect(notices()).toHaveLength(1);
    expect(tree.root.findByType(SectionHeader).props.count).toBeUndefined();
  });

  it('does not call failed task reads an empty work list', async () => {
    await render(<TasksSection patientId={null} />);
    expect(text()).toContain('کاری باز نیست');
    fail(taskCountQuery({ patientId: null, status: 'open' }));
    await refresh(<TasksSection patientId={null} />);
    expect(text()).not.toContain('کاری باز نیست');
    expect(tree.root.findByType(SectionHeader).props.count).toBeUndefined();
    await retryAll();
    await refresh(<TasksSection patientId={null} />);
    expect(text()).toContain('کاری باز نیست');
  });
});

describe('shift and round read recovery', () => {
  it.each([ShiftScreen, RoundScreen])(
    'does not present a failed cached-empty shift read as no active shift (%p)',
    async (Component) => {
      await render(<Component />);
      expect(tree.root.findByType(EmptyState).props.title).toBe('شیفتی باز نیست');
      fail(activeShiftQuery());
      await refresh(<Component />);
      expect(tree.root.findAllByType(EmptyState)).toHaveLength(0);
      expect(notices()).toHaveLength(1);
      await retryAll();
      await refresh(<Component />);
      expect(tree.root.findByType(EmptyState).props.title).toBe('شیفتی باز نیست');
    },
  );

  it.each([ShiftScreen, RoundScreen])(
    'withholds empty membership claims until a failed read succeeds (%p)',
    async (Component) => {
      await startShift();
      await render(<Component />);
      fail(activeShiftWorkspaceQuery());
      await refresh(<Component />);
      expect(tree.root.findAllByType(EmptyState)).toHaveLength(0);
      expect(notices()).toHaveLength(1);
      await retryAll();
      await refresh(<Component />);
      expect(tree.root.findAllByType(EmptyState)).toHaveLength(1);
    },
  );

  it.each([ShiftScreen, RoundScreen])(
    'does not claim all patients have been seen after a failed membership refresh (%p)',
    async (Component) => {
      const id = await startShift();
      const memberId = await addPatientToShift(id, patientId);
      await shiftQueries.setShiftPatientReviewed(memberId, true);
      await render(<Component />);
      fail(activeShiftWorkspaceQuery());
      await refresh(<Component />);
      expect(tree.root.findAllByType(EmptyState)).toHaveLength(0);
      expect(tree.root.findAllByType(Badge).some((n) => n.props.tone === 'success')).toBe(false);
      expect(notices()).toHaveLength(1);
    },
  );

  it.each([ShiftScreen, RoundScreen])(
    'withholds completion and empty claims after a failed active-shift refresh (%p)',
    async (Component) => {
      const id = await startShift();
      const memberId = await addPatientToShift(id, patientId);
      await shiftQueries.setShiftPatientReviewed(memberId, true);
      await render(<Component />);
      fail(activeShiftQuery());
      await refresh(<Component />);
      expect(tree.root.findAllByType(EmptyState)).toHaveLength(0);
      expect(tree.root.findAllByType(Badge).some((n) => n.props.tone === 'success')).toBe(false);
      expect(notices()).toHaveLength(1);
      await shiftQueries.removePatientFromShift(memberId);
      await refresh(<Component />);
      expect(tree.root.findAllByType(EmptyState)).toHaveLength(0);
      await retryAll();
      await refresh(<Component />);
      expect(tree.root.findAllByType(EmptyState)).toHaveLength(1);
    },
  );

  it.each([ShiftScreen, RoundScreen])('shows loading instead of zero members (%p)', async (Component) => {
    await startShift();
    mockLoading.add(tableOf(activeShiftWorkspaceQuery()));
    await render(<Component />);
    expect(tree.root.findAllByType(EmptyState)).toHaveLength(0);
    expect(tree.root.findAllByType(SectionHeader).every((n) => n.props.count === undefined)).toBe(true);
    expect(text()).toContain('در حال خواندن');
    expect(tree.root.findAllByType(Badge).some((n) => n.props.label.includes('۰'))).toBe(false);
  });

  it('retries last-note and consult reads without resetting round handoff input', async () => {
    const id = await startShift();
    await addPatientToShift(id, patientId);
    await render(<RoundScreen />);
    const handoff = () => tree.root.findAllByType(Input).find((n) => n.props.label === 'یادداشت تحویل شیفت')!;
    await act(async () => {
      handoff().props.onChangeText('Keep this handoff');
    });
    fail(latestPatientNoteQuery(patientId));
    fail(patientConsultsQuery(patientId));
    await refresh(<RoundScreen />);
    expect(notices()).toHaveLength(2);
    await retryAll();
    await refresh(<RoundScreen />);
    expect(notices()).toHaveLength(0);
    expect(handoff().props.value).toBe('Keep this handoff');
  });

  it.each([ShiftScreen, RoundScreen])(
    'keeps handoff input through failed refresh and retry (%p)',
    async (Component) => {
      const id = await startShift();
      await addPatientToShift(id, patientId);
      await render(<Component />);
      const handoff = () => tree.root.findAllByType(Input).find((n) => n.props.label === 'یادداشت تحویل شیفت')!;
      await act(async () => {
        handoff().props.onChangeText('Current handoff text');
      });
      fail(activeShiftWorkspaceQuery());
      await refresh(<Component />);
      expect(handoff().props.value).toBe('Current handoff text');
      expect(notices()).toHaveLength(1);
      await retryAll();
      await refresh(<Component />);
      expect(handoff().props.value).toBe('Current handoff text');
    },
  );

  it('keeps the add-patient picker after a failed write and ignores rapid repeat taps', async () => {
    const id = await startShift();
    await render(<ShiftScreen />);
    await act(async () => {
      tree.root
        .findAllByType(Button)
        .find((n) => n.props.label === 'افزودن بیمار')!
        .props.onPress();
    });
    const add = jest.spyOn(shiftQueries, 'addPatientToShift').mockRejectedValueOnce(new Error('Synthetic failure'));
    await act(async () => {
      tree.root.findByType(PickerModal).props.onSelect({ id: patientId });
    });
    expect(tree.root.findByType(PickerModal).props.visible).toBe(true);
    await act(async () => {
      const select = tree.root.findByType(PickerModal).props.onSelect;
      select({ id: patientId });
      select({ id: patientId });
    });
    expect(add).toHaveBeenCalledTimes(2);
    expect(await shiftPatientsQuery(id)).toHaveLength(1);
    expect(tree.root.findByType(PickerModal).props.visible).toBe(false);
  });
});

describe('timeline partial reads', () => {
  it('shows failed sources instead of endless loading or an empty-record claim, and retries them only', async () => {
    fail(patientLabPanelsQuery(patientId));
    fail(patientConsultsQuery(patientId));
    await render(<TimelineTab patientId={patientId} />);
    expect(tree.root.findAllByType(EmptyState)).toHaveLength(0);
    expect(notices()[0]!.props.what).toContain('آزمایش‌ها');
    expect(notices()[0]!.props.what).toContain('کانسالت‌ها');
    expect(text()).not.toContain('در حال خواندن');
    await retryAll();
    await refresh(<TimelineTab patientId={patientId} />);
    // A panel failure also affects the joined value query; both reads recover.
    expect(mockRetried).toEqual([
      tableOf(patientLabPanelsQuery(patientId)),
      tableOf(patientLabPanelsQuery(patientId)),
      tableOf(patientConsultsQuery(patientId)),
    ]);
    expect(tree.root.findByType(EmptyState).props.title).toBe('هنوز چیزی ثبت نشده');
  });

  it('keeps available notes and labels their partial event count', async () => {
    await createNote({ patientId, type: 'general', body: 'Example note' });
    fail(patientLabPanelsQuery(patientId));
    await render(<TimelineTab patientId={patientId} />);
    expect(text()).toContain('Example note');
    expect(text()).toContain('فهرست کامل نیست');
    expect(tree.root.findAllByType(EmptyState)).toHaveLength(0);
  });
});

describe('shift and capture summaries', () => {
  it('never equates a failed shift read with no active shift', async () => {
    fail(activeShiftQuery());
    await render(<ShiftCard />);
    expect(text()).not.toContain('شیفتی باز نیست');
    expect(notices()).toHaveLength(1);
    await retryAll();
    await refresh(<ShiftCard />);
    expect(text()).toContain('شیفتی باز نیست');
  });

  it('hides round completion badges after membership read failure', async () => {
    const id = await startShift();
    await addPatientToShift(id, patientId);
    await render(<ShiftCard />);
    expect(tree.root.findAllByType(Badge)).toHaveLength(1);
    fail(shiftPatientsQuery(id));
    await refresh(<ShiftCard />);
    expect(tree.root.findAllByType(Badge)).toHaveLength(0);
    expect(notices()).toHaveLength(1);
  });

  it('shows capture read errors, reads only a preview, and counts all unfiled captures', async () => {
    fail(captures.inboxQuery());
    await render(<InboxSection />);
    expect(notices().length).toBeGreaterThan(0);
    await retryAll();
    for (let i = 0; i < 52; i++) await captures.createCapture({ text: `Example ${i}` });
    await refresh(<InboxSection />);
    expect(tree.root.findByType(SectionHeader).props.count).toBe(52);
    expect(tree.root.findAllByType(CaptureCard)).toHaveLength(3);
    expect(text()).toContain('۴۹ مورد دیگر');
  });

  it('retains patient assignment on write failure, blocks stale picker data, and retries without duplicates', async () => {
    const id = await captures.createCapture({ text: 'Example capture' });
    await render(<InboxSection />);
    await act(async () => {
      tree.root.findByType(CaptureCard).props.onAskPatient({ captureId: id, purpose: 'assign', selectedId: null });
    });
    const update = jest.spyOn(captures, 'updateCapture').mockRejectedValueOnce(new Error('Synthetic write failure'));
    await act(async () => {
      tree.root.findByType(PickerModal).props.onSelect({ id: patientId });
    });
    expect(tree.root.findByType(PickerModal).props.visible).toBe(true);
    fail(patientListQuery());
    await refresh(<InboxSection />);
    expect(tree.root.findByType(PickerModal).props.visible).toBe(false);
    await act(async () => {
      tree.root.findByType(PickerModal).props.onSelect({ id: patientId });
    });
    expect(update).toHaveBeenCalledTimes(1);
    await retryAll();
    await refresh(<InboxSection />);
    await act(async () => {
      const select = tree.root.findByType(PickerModal).props.onSelect;
      select({ id: patientId });
      select({ id: patientId });
    });
    expect(update).toHaveBeenCalledTimes(2);
    expect(captures.captureQuery(id).get()!.patientId).toBe(patientId);
    expect(tree.root.findByType(PickerModal).props.visible).toBe(false);
  });
});
