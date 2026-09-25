import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type ReactElement } from 'react';
import { ActivityIndicator, Alert, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { Button, Input } from '@/components/ui';
import { tablesOf } from '@/db/query-tables';
import * as notifications from '@/platform/notifications';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { ConsultAnswerScreen } from './consults/answer-screen';
import { consultQuery } from './consults/queries';
import { DoctorFormScreen } from './doctors/doctor-form-screen';
import { OccasionFormScreen } from './doctors/occasion-form-screen';
import { createOccasion, occasionQuery } from './doctors/occasions-queries';
import { createDoctor, doctorQuery } from './doctors/queries';
import { EncounterFormScreen } from './encounters/encounter-form-screen';
import { encounterQuery, openEncounter } from './encounters/queries';
import { ImagingFormScreen } from './imaging/imaging-form-screen';
import { imagingStudyQuery } from './imaging/queries';
import { OrderFormScreen } from './kardex/order-form-screen';
import { orderQuery } from './kardex/queries';
import { IdeaFormScreen } from './knowledge/idea-form-screen';
import { ideaQuery } from './knowledge/ideas-queries';
import { PrescriptionFormScreen } from './knowledge/prescription-form-screen';
import { prescriptionQuery } from './knowledge/prescriptions-queries';
import { topicQuery } from './knowledge/queries';
import { SpecialtyFormScreen } from './knowledge/specialty-form-screen';
import { specialtyProfileQuery } from './knowledge/specialty-profiles-queries';
import { TopicFormScreen } from './knowledge/topic-form-screen';
import { LabEntryScreen } from './labs/lab-entry-screen';
import { createLabPanel, labPanelQuery, panelValuesQuery } from './labs/queries';
import { noteDraftQuery } from './notes/draft-queries';
import { NoteEditorScreen } from './notes/note-editor-screen';
import { createNote, noteQuery } from './notes/queries';
import { createPatient } from './patients/queries';
import { ExtensionFormScreen } from './places/extension-form-screen';
import { PlaceFormScreen } from './places/place-form-screen';
import { extensionQuery, placeQuery } from './places/queries';
import { ShiftHistoryScreen } from './shifts/history-screen';
import { addPatientToShift, shiftPatientsQuery, shiftQuery, startShift } from './shifts/queries';
import { RoundScreen } from './shifts/round-screen';
import { createTask, taskQuery } from './tasks/queries';
import { TaskScreen } from './tasks/task-screen';
import { CredentialFormScreen } from './vault/credential-form-screen';
import { credentialQuery } from './vault/queries';

// Retain the last query result on failure, exactly as useLive does. Rendering and
// autosave handlers are real; native navigation, media and visual widgets are not.
const mockCache = new Map<string, unknown[] | undefined>();
const mockErrors = new Map<string, Error>();
const mockRetried: string[] = [];
let mockParams: Record<string, string>;
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[] }) => {
    const { tablesOf } = jest.requireActual<typeof import('@/db/query-tables')>('@/db/query-tables');
    const key = tablesOf(query)[0]!;
    if (!mockCache.has(key)) mockCache.set(key, query.all());
    return {
      data: mockCache.get(key),
      error: mockErrors.get(key),
      retry: () => {
        mockRetried.push(key);
        mockErrors.delete(key);
        mockCache.delete(key);
      },
    };
  },
}));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/components/ui', () => ({
  Badge: 'Badge',
  Button: 'Button',
  Card: 'Card',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  Divider: 'Divider',
  EmptyState: 'EmptyState',
  IconButton: 'IconButton',
  Input: 'Input',
  Row: 'Row',
  Screen: 'Screen',
  SectionHeader: 'SectionHeader',
  SelectField: 'SelectField',
  Text: 'Text',
  Toggle: 'Toggle',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {}, radii: {}, typography: {} }) }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({
  alertError: jest.fn(),
  notify: jest.requireActual<typeof import('@/components/feedback')>('@/components/feedback').notify,
}));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: () => {} }));
jest.mock('@/components/use-now', () => ({ useNow: () => new Date('2026-09-24T12:00:00Z').getTime() }));
jest.mock('@/components/picker-modal', () => ({ PickerModal: 'PickerModal' }));
jest.mock('@/components/prompt-modal', () => ({ PromptModal: 'PromptModal' }));
jest.mock('@/components/voice-note-player', () => ({ VoiceNotePlayer: 'VoiceNotePlayer' }));
jest.mock('@/components/voice-recorder', () => ({ VoiceRecorder: 'VoiceRecorder' }));
jest.mock('@/components/quick-date-field', () => ({ QuickDateField: 'QuickDateField' }));
jest.mock('@/components/jalali-date-field', () => ({ JalaliDateField: 'JalaliDateField' }));
jest.mock('@/features/attachments/voice-notes', () => ({ VoiceNotesSection: 'VoiceNotesSection' }));
jest.mock('@/features/consults/consults-brief', () => ({ ConsultsBrief: 'ConsultsBrief' }));
jest.mock('@/features/patients/patient-header', () => ({ AllergyBanner: 'AllergyBanner' }));
jest.mock('@/features/tasks/tasks-section', () => ({ TasksSection: 'TasksSection' }));
jest.mock('@/platform/media', () => ({}));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));

let t: TestDatabase;
let tree: ReactTestRenderer;
let patientId: string;
const input = (label: string) => tree.root.findAllByType(Input).find((node) => node.props.label === label)!;
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
async function render(element: ReactElement) {
  await act(async () => {
    tree = create(element);
  });
}
async function refresh(element: ReactElement) {
  await act(async () => {
    tree.update(element);
    await settle();
  });
}
async function type(label: string, value: string) {
  await act(async () => {
    input(label).props.onChangeText(value);
    jest.advanceTimersByTime(850);
    await settle();
  });
}
function expectReadError() {
  expect(tree.root.findAllByType(ErrorNotice).some((node) => node.props.error)).toBe(true);
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Test', lastName: 'Patient', status: 'outpatient' });
  mockParams = { id: patientId };
  mockCache.clear();
  mockErrors.clear();
  mockRetried.length = 0;
  jest.useFakeTimers();
});
afterEach(async () => {
  if (tree)
    await act(async () => {
      tree.unmount();
      await settle();
    });
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('editors survive database read failures', () => {
  it.each<[string, string, (id: string) => unknown, () => ReactElement]>([
    ['doctor', 'doctorId', doctorQuery, () => <DoctorFormScreen />],
    ['encounter', 'encounterId', encounterQuery, () => <EncounterFormScreen />],
    ['imaging', 'studyId', imagingStudyQuery, () => <ImagingFormScreen />],
    ['order', 'orderId', orderQuery, () => <OrderFormScreen />],
    ['idea', 'ideaId', ideaQuery, () => <IdeaFormScreen />],
    ['prescription', 'templateId', prescriptionQuery, () => <PrescriptionFormScreen />],
    ['specialty', 'profileId', specialtyProfileQuery, () => <SpecialtyFormScreen />],
    ['topic', 'topicId', topicQuery, () => <TopicFormScreen />],
    ['place', 'placeId', placeQuery, () => <PlaceFormScreen />],
    ['extension', 'extensionId', extensionQuery, () => <ExtensionFormScreen />],
    ['credential', 'credentialId', credentialQuery, () => <CredentialFormScreen />],
    ['lab panel', 'panelId', labPanelQuery, () => <LabEntryScreen />],
    ['lab values', 'panelId', panelValuesQuery, () => <LabEntryScreen />],
    ['note', 'noteId', noteQuery, () => <NoteEditorScreen />],
    ['occasion', 'occasionId', occasionQuery, () => <OccasionFormScreen />],
    ['task', 'taskId', taskQuery, () => <TaskScreen />],
    ['consult answer', 'consultId', consultQuery, () => <ConsultAnswerScreen />],
    ['shift history', 'shiftId', shiftQuery, () => <ShiftHistoryScreen />],
  ])('offers retry instead of endless loading for a failed %s read', async (_label, param, query, element) => {
    mockParams = { id: patientId, [param]: 'example' };
    const key = tablesOf(query('example'))[0]!;
    mockCache.set(key, undefined);
    mockErrors.set(key, new Error('Synthetic read failure'));
    await render(element());
    expect(tree.root.findAllByType(ActivityIndicator).length).toBe(0);
    expect(tree.root.findAllByType(Input).length).toBe(0);
    const notice = tree.root.findAllByType(ErrorNotice).find((node) => node.props.error)!;
    expect(notice).toBeDefined();
    await act(async () => {
      notice.props.onRetry();
    });
    expect(mockRetried).toContain(key);
  });

  it('retains edited lab values when the value query fails after loading', async () => {
    const id = await createLabPanel({
      patientId,
      collectedAt: new Date('2026-09-25T12:00:00Z'),
      source: 'manual',
      values: [{ analyte: 'Hb', value: '12.5', unit: 'g/dL' }],
    });
    mockParams = { id: patientId, panelId: id };
    await render(<LabEntryScreen />);
    await act(async () => {
      tree.root
        .findAllByType(TextInput)
        .find((node) => node.props.value === '12.5')!
        .props.onChangeText('13.0');
    });
    const key = tablesOf(panelValuesQuery(id))[0]!;
    mockErrors.set(key, new Error('Synthetic read failure'));
    await refresh(<LabEntryScreen />);
    expectReadError();
    expect(tree.root.findAllByType(TextInput).some((node) => node.props.value === '13.0')).toBe(true);
    await act(async () => {
      tree.root
        .findAllByType(ErrorNotice)
        .find((node) => node.props.error)!
        .props.onRetry();
    });
    await refresh(<LabEntryScreen />);
    expect(tree.root.findAllByType(TextInput).some((node) => node.props.value === '13.0')).toBe(true);
  });

  it('retains unsaved encounter text through a failed refresh and retry', async () => {
    const id = await openEncounter({ patientId, kind: 'admission', chiefComplaint: 'Stored complaint' });
    mockParams = { id: patientId, encounterId: id };
    await render(<EncounterFormScreen />);
    const field = tree.root.findAllByType(Input).find((node) => node.props.value === 'Stored complaint')!;
    await act(async () => {
      field.props.onChangeText('Latest complaint');
    });
    const key = tablesOf(encounterQuery(id))[0]!;
    mockErrors.set(key, new Error('Synthetic read failure'));
    await refresh(<EncounterFormScreen />);
    expectReadError();
    expect(tree.root.findAllByType(Input).some((node) => node.props.value === 'Latest complaint')).toBe(true);
    await act(async () => {
      tree.root
        .findAllByType(ErrorNotice)
        .find((node) => node.props.error)!
        .props.onRetry();
    });
    await refresh(<EncounterFormScreen />);
    expect(tree.root.findAllByType(Input).some((node) => node.props.value === 'Latest complaint')).toBe(true);
    expect(tree.root.findAllByType(ErrorNotice).some((node) => node.props.error)).toBe(false);
  });

  it('separates an occasion save from a failed alarm and ignores a second simultaneous submit', async () => {
    const doctorId = await createDoctor({ firstName: 'Example', lastName: 'Colleague' });
    const occasionId = await createOccasion({
      doctorId,
      title: 'Stored title',
      kind: 'custom',
      isRecurring: false,
      onDate: '2030-01-02',
    });
    mockParams = { doctorId, occasionId };
    await render(<OccasionFormScreen />);
    await type('عنوان', 'Latest title');
    jest.spyOn(notifications, 'scheduleReminder').mockRejectedValueOnce(new Error('Native unavailable'));
    const alert = jest.spyOn(Alert, 'alert');
    await act(async () => {
      const submit = tree.root.findAllByType(Button).find((node) => node.props.label === 'ذخیره')!.props.onPress;
      submit();
      submit();
      await settle();
    });
    expect(occasionQuery(occasionId).get()).toMatchObject({
      title: 'Latest title',
      reminderRevision: 1,
      reminderAppliedRevision: -1,
    });
    expect(alert).toHaveBeenCalledWith('مناسبت ذخیره شد', expect.stringContaining('یادآور'), [{ text: 'باشه' }]);
  });

  it('shows an initial occasion read failure without leaving an endless loading indicator', async () => {
    mockParams = { doctorId: 'example', occasionId: 'example' };
    mockCache.set('occasions', undefined);
    mockErrors.set('occasions', new Error('Synthetic read failure'));
    await render(<OccasionFormScreen />);
    expectReadError();
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  });

  it('keeps an occasion edit mounted when refresh and explicit save both fail', async () => {
    const doctorId = await createDoctor({ firstName: 'Example', lastName: 'Colleague' });
    const occasionId = await createOccasion({
      doctorId,
      title: 'Stored title',
      kind: 'custom',
      isRecurring: false,
      onDate: '2030-01-02',
    });
    mockParams = { doctorId, occasionId };
    await render(<OccasionFormScreen />);
    await type('عنوان', 'Latest title');
    mockErrors.set('occasions', new Error('Synthetic read failure'));
    await refresh(<OccasionFormScreen />);
    expectReadError();
    expect(input('عنوان').props.value).toBe('Latest title');
    t.sqlite.exec(
      "CREATE TRIGGER fail_occasion BEFORE UPDATE ON occasions BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await act(async () => {
      tree.root
        .findAllByType(Button)
        .find((node) => node.props.label === 'ذخیره')!
        .props.onPress();
      await settle();
    });
    expect(input('عنوان').props.value).toBe('Latest title');
    t.sqlite.exec('DROP TRIGGER fail_occasion');
    await act(async () => {
      tree.root
        .findAllByType(Button)
        .find((node) => node.props.label === 'ذخیره')!
        .props.onPress();
      await settle();
    });
    expect(occasionQuery(occasionId).get()?.title).toBe('Latest title');
  });

  it('keeps a failed task edit mounted through a later read error, then retries the same text', async () => {
    const taskId = await createTask({ title: 'Stored title' });
    mockParams = { taskId };
    await render(<TaskScreen />);
    t.sqlite.exec(
      "CREATE TRIGGER fail_write BEFORE UPDATE ON tasks BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await type('عنوان', 'Latest title');
    mockErrors.set('tasks', new Error('Synthetic read failure'));
    await refresh(<TaskScreen />);
    expect(input('عنوان').props.value).toBe('Latest title');
    expectReadError();
    t.sqlite.exec('DROP TRIGGER fail_write');
    await act(async () => {
      await tree.root
        .findAllByType(Button)
        .find((node) => node.props.label === 'ذخیره نشد؛ تلاش دوباره')!
        .props.onPress();
    });
    expect((await taskQuery(taskId))[0]?.title).toBe('Latest title');
  });

  it('keeps the current round handoff visible when member refresh and saving both fail', async () => {
    const shiftId = await startShift();
    await addPatientToShift(shiftId, patientId);
    await render(<RoundScreen />);
    t.sqlite.exec(
      "CREATE TRIGGER fail_write BEFORE UPDATE ON shift_patients BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await type('یادداشت تحویل شیفت', 'Latest handoff');
    mockErrors.set('shift_patients', new Error('Synthetic read failure'));
    await refresh(<RoundScreen />);
    expect(input('یادداشت تحویل شیفت').props.value).toBe('Latest handoff');
    expectReadError();
    t.sqlite.exec('DROP TRIGGER fail_write');
    await act(async () => {
      await tree.root
        .findAllByType(Button)
        .find((node) => node.props.label === 'ذخیره نشد؛ تلاش دوباره')!
        .props.onPress();
    });
    expect((await shiftPatientsQuery(shiftId))[0]?.member.handoffNote).toBe('Latest handoff');
  });

  it('shows an initial note read error instead of an endless spinner', async () => {
    mockParams.noteId = 'unread-note';
    mockCache.set('notes', undefined);
    mockErrors.set('notes', new Error('Synthetic read failure'));
    await render(<NoteEditorScreen />);
    expectReadError();
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    expect(tree.root.findAllByType(Input)).toHaveLength(0);
  });

  it('does not open a blank note over an unread recovered draft', async () => {
    mockCache.set('note_drafts', undefined);
    mockErrors.set('note_drafts', new Error('Synthetic read failure'));
    await render(<NoteEditorScreen />);
    expectReadError();
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    expect(tree.root.findAllByType(Input)).toHaveLength(0);
  });

  it('shows later note/draft read failures without resetting the typed note', async () => {
    const noteId = await createNote({ patientId, type: 'progress', title: 'Stored title' });
    mockParams.noteId = noteId;
    await render(<NoteEditorScreen />);
    await type('عنوان', 'Latest note title');
    mockErrors.set('notes', new Error('Synthetic read failure'));
    mockErrors.set('note_drafts', new Error('Synthetic draft read failure'));
    await refresh(<NoteEditorScreen />);
    expect(input('عنوان').props.value).toBe('Latest note title');
    expectReadError();
    expect((await noteDraftQuery(patientId, noteId))[0]?.title).toBe('Latest note title');
  });
});
