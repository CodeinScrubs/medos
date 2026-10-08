import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AutosaveScope } from '@/components/autosave-scope';
import { alertError } from '@/components/feedback';
import { Button, IconButton, Segmented } from '@/components/ui';
import { VoiceNotePlayer } from '@/components/voice-note-player';
import { restoreDatabase } from '@/db/client';
import {
  attachments,
  consultations,
  imagingStudies,
  labPanels,
  orders,
  patientContacts,
  patients,
  tasks,
} from '@/db/schema';
import { MediaTab } from '@/features/attachments/media-tab';
import { addAttachment } from '@/features/attachments/queries';
import { importTables } from '@/features/backup/import';
import { ConsultsSection } from '@/features/consults/consults-section';
import { createConsult } from '@/features/consults/queries';
import { ImagingTab } from '@/features/imaging/imaging-tab';
import { createImagingStudy } from '@/features/imaging/queries';
import { KardexTab } from '@/features/kardex/kardex-tab';
import { createOrder } from '@/features/kardex/queries';
import { LabsTab } from '@/features/labs/labs-tab';
import { createLabPanel } from '@/features/labs/queries';
import { createTask, taskQuery } from '@/features/tasks/queries';
import { TaskRow } from '@/features/tasks/task-row';
import { DatasetBusyError, DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { OverviewTab } from './overview-tab';
import { PatientHeader } from './patient-header';
import { addPatientContact, createPatient, patientQuery } from './queries';

let mockSource: ((source: 'camera' | 'library') => Promise<void>) | undefined;
let mockUndo: (() => Promise<void>) | undefined;
const mockPhotoWork = jest.fn<() => Promise<string[]>>().mockResolvedValue([]);
jest.mock('react-native', () => {
  const native = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy(native, {
    get: (target, key) => (key === 'Pressable' ? 'Pressable' : Reflect.get(target, key)),
  });
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-haptics', () => ({
  impactAsync: () => Promise.resolve(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[] }) => ({ data: query.all(), retry: jest.fn() }),
}));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/platform/media', () => ({ mediaUri: (value: string) => value }));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: jest.fn() }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/voice-note-player', () => ({ VoiceNotePlayer: 'VoiceNotePlayer' }));
jest.mock('@/components/voice-recorder', () => ({ VoiceRecorder: 'VoiceRecorder' }));
jest.mock('@/components/undo-toast', () => ({
  useUndo: () => (offer: { undo: () => Promise<void> }) => {
    mockUndo = offer.undo;
  },
}));
jest.mock('@/components/ui', () => ({
  Avatar: 'Avatar',
  Badge: 'Badge',
  Button: 'Button',
  Card: 'Card',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  DataRow: 'DataRow',
  Divider: 'Divider',
  EmptyState: 'EmptyState',
  IconButton: 'IconButton',
  Row: 'Row',
  SectionHeader: 'SectionHeader',
  Segmented: 'Segmented',
  Text: 'Text',
}));
jest.mock('@/theme', () => ({
  MIN_TOUCH: 48,
  useTheme: () => ({
    colors: {},
    spacing: {},
    radii: {},
    typography: jest.requireActual<typeof import('@/theme/tokens')>('@/theme/tokens').typography,
  }),
}));
jest.mock('@/features/attachments/capture', () => ({
  askPhotoSource: (choose: typeof mockSource) => {
    mockSource = choose;
  },
  attachPhotos: () => mockPhotoWork(),
}));
jest.mock('@/features/attachments/voice-notes', () => ({ useRecordingHandoff: () => ({ ownedId: undefined }) }));
jest.mock('@/features/attachments/recording-recovery', () => ({ RecordingRecovery: 'RecordingRecovery' }));
jest.mock('@/features/consults/request-editor', () => ({ ConsultRequestEditor: 'ConsultRequestEditor' }));
jest.mock('@/features/diagnoses/diagnoses-section', () => ({ DiagnosesSection: 'DiagnosesSection' }));
jest.mock('@/features/tasks/tasks-section', () => ({ TasksSection: 'TasksSection' }));
jest.mock('@/features/followups/follow-up-card', () => ({ FollowUpCard: 'FollowUpCard' }));
jest.mock('./patient-snapshot', () => ({ PatientSnapshot: 'PatientSnapshot' }));

let t: TestDatabase;
let patientId: string;
let tree: ReactTestRenderer | undefined;
let snapshotCounter = 0;
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
const pressable = (label: string) =>
  tree!.root.findAllByType(Pressable).find((node) => node.props.accessibilityLabel === label)!;
async function settle() {
  for (let i = 0; i < 24; i++) await Promise.resolve();
}
async function render(node: React.ReactNode) {
  await act(async () => {
    tree = create(<AutosaveScope>{node}</AutosaveScope>);
  });
}
async function invoke(work: () => unknown) {
  await act(async () => {
    await work();
    await settle();
  });
}
function confirmation(label: string) {
  const dialogs = jest.mocked(Alert.alert).mock.calls;
  const action = dialogs.at(-1)?.[2]?.find((item) => item.text === label)?.onPress;
  expect(action).toBeDefined();
  return action!;
}
function snapshot() {
  const path = `/manual-intents-${++snapshotCounter}.db`;
  t.sqlite.exec(`VACUUM INTO '${path}'`);
  return async () => {
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
    });
  };
}
function tracked() {
  return {
    orders: t.db.select().from(orders).all(),
    tasks: t.db.select().from(tasks).all(),
    consultations: t.db.select().from(consultations).all(),
    attachments: t.db.select().from(attachments).all(),
    panels: t.db.select().from(labPanels).all(),
    imaging: t.db.select().from(imagingStudies).all(),
    contacts: t.db.select().from(patientContacts).all(),
    patients: t.db.select().from(patients).all(),
  };
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Intent' });
  mockSource = undefined;
  mockUndo = undefined;
  mockPhotoWork.mockClear();
  mockPhotoWork.mockResolvedValue([]);
  jest.mocked(alertError).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
  tree = undefined;
  jest.restoreAllMocks();
});

describe('manual patient mutations keep the originating dataset', () => {
  it.each(['توقف موقت', 'تمام شد'])('refuses an old immediate kardex action: %s', async (label) => {
    await createOrder({ patientId, kind: 'drug', name: 'Synthetic order' });
    const restore = snapshot();
    const before = tracked();
    await render(<KardexTab patientId={patientId} />);
    const old = pressable(label).props.onPress;
    await restore();
    await invoke(old);
    expect(tracked()).toEqual(before);
    expect(alertError).toHaveBeenCalledWith('تغییر ثبت نشد', expect.any(DatasetChangedError));
  });

  it.each(['قطع', 'حذف'])('refuses a held kardex confirmation: %s', async (label) => {
    await createOrder({ patientId, kind: 'drug', name: 'Synthetic order' });
    const restore = snapshot();
    const before = tracked();
    await render(<KardexTab patientId={patientId} />);
    await invoke(() =>
      label === 'قطع'
        ? pressable('قطع').props.onPress()
        : tree!.root
            .findAllByType(Pressable)
            .find((n) => n.props.onLongPress)!
            .props.onLongPress(),
    );
    const old = confirmation(label);
    await restore();
    await invoke(old);
    expect(tracked()).toEqual(before);
    expect(alertError).toHaveBeenCalledWith(
      label === 'قطع' ? 'تغییر ثبت نشد' : 'حذف نشد',
      expect.any(DatasetChangedError),
    );
  });

  it('refuses an old task checkbox and its Undo retained after row unmount', async () => {
    const id = await createTask({ patientId, title: 'Synthetic task' });
    const row = (await taskQuery(id))[0]!;
    await render(<TaskRow task={row} patient={null} onOpen={() => {}} />);
    const old = pressable('انجام شد').props.onPress;
    await invoke(old);
    expect((await taskQuery(id))[0]?.status).toBe('done');
    expect(mockUndo).toBeDefined();
    const undo = mockUndo!;
    const restore = snapshot();
    const before = tracked();
    await restore();
    await invoke(old);
    expect(tracked()).toEqual(before);
    expect(alertError).toHaveBeenCalledWith('وضعیت کار تغییر نکرد', expect.any(DatasetChangedError));
    await act(async () => tree!.unmount());
    tree = undefined;
    await expect(undo()).rejects.toBeInstanceOf(DatasetChangedError);
    expect(tracked()).toEqual(before);
  });

  it('rejects an Undo retained globally after its task row unmounts and the dataset changes', async () => {
    const id = await createTask({ patientId, title: 'Synthetic task' });
    await render(<TaskRow task={(await taskQuery(id))[0]!} patient={null} onOpen={() => {}} />);
    await invoke(pressable('انجام شد').props.onPress);
    const undo = mockUndo!;
    expect(undo).toBeDefined();
    const restore = snapshot();
    const before = tracked();
    await act(async () => tree!.unmount());
    tree = undefined;
    await restore();
    await expect(undo()).rejects.toBeInstanceOf(DatasetChangedError);
    expect(tracked()).toEqual(before);
  });

  it('holds a fresh media action admitted until its awaited photo acknowledgment completes', async () => {
    let acknowledge!: (ids: string[]) => void;
    const pending = new Promise<string[]>((resolve) => {
      acknowledge = resolve;
    });
    mockPhotoWork.mockImplementationOnce(() => pending);
    await render(<MediaTab patientId={patientId} />);
    await invoke(() => button('افزودن عکس بالینی').props.onPress());
    await act(async () => {
      const work = mockSource!('library');
      try {
        expect(mockPhotoWork).toHaveBeenCalledTimes(1);
        expect(() => reserveDatasetReplacement().release()).toThrow(DatasetBusyError);
      } finally {
        acknowledge([]);
        await work;
      }
    });
    reserveDatasetReplacement().release();
    expect(alertError).not.toHaveBeenCalled();
  });

  it.each(['درخواست شد', 'لغو'])('refuses old consult state/confirmation: %s', async (label) => {
    await createConsult({ patientId, reason: 'Synthetic request' });
    const restore = snapshot();
    const before = tracked();
    await render(<ConsultsSection patientId={patientId} />);
    let old = button(label).props.onPress;
    if (label === 'لغو') {
      await invoke(old);
      old = confirmation('لغو کانسالت');
    }
    await restore();
    await invoke(old);
    expect(tracked()).toEqual(before);
    expect(alertError).toHaveBeenCalledWith('تغییر ثبت نشد', expect.any(DatasetChangedError));
  });

  it('refuses an old patient star without changing restored timestamps', async () => {
    const patient = (await patientQuery(patientId))[0]!;
    const restore = snapshot();
    const before = tracked();
    await render(<PatientHeader patient={patient} />);
    const old = tree!.root.findAllByType(IconButton).find((n) => n.props.label === 'ستاره‌دار کردن')!.props.onPress;
    await restore();
    await invoke(old);
    expect(tracked()).toEqual(before);
    expect(alertError).toHaveBeenCalledWith('ستاره ثبت نشد', expect.any(DatasetChangedError));
  });

  it('refuses a held contact removal', async () => {
    await addPatientContact(patientId, { name: 'Synthetic contact', phone: '1234567890' });
    const restore = snapshot();
    const before = tracked();
    await render(<OverviewTab patient={(await patientQuery(patientId))[0]!} />);
    await invoke(() =>
      tree!.root
        .findAllByType(Pressable)
        .find((n) => n.props.onLongPress)!
        .props.onLongPress(),
    );
    const old = confirmation('حذف');
    await restore();
    await invoke(old);
    expect(tracked()).toEqual(before);
    expect(alertError).toHaveBeenCalledWith('حذف نشد', expect.any(DatasetChangedError));
  });

  it('refuses a held imaging removal', async () => {
    await createImagingStudy({ patientId, modality: 'other', status: 'ordered' });
    const restore = snapshot();
    const before = tracked();
    await render(<ImagingTab patientId={patientId} />);
    await invoke(() =>
      tree!.root
        .findAllByType(Pressable)
        .find((n) => n.props.onLongPress)!
        .props.onLongPress(),
    );
    const old = confirmation('حذف');
    await restore();
    await invoke(old);
    expect(tracked()).toEqual(before);
    expect(alertError).toHaveBeenCalledWith('حذف نشد', expect.any(DatasetChangedError));
  });

  it.each(['clinical_photo', 'voice'] as const)('refuses held media removal: %s', async (kind) => {
    await addAttachment({
      entityType: 'patient',
      entityId: patientId,
      patientId,
      kind,
      relativePath: 'media/synthetic/test',
      caption: 'Synthetic media',
    });
    const restore = snapshot();
    const before = tracked();
    await render(<MediaTab patientId={patientId} />);
    await invoke(() =>
      kind === 'voice'
        ? tree!.root.findByType(VoiceNotePlayer).props.onLongPress()
        : tree!.root
            .findAllByType(Pressable)
            .find((n) => n.props.onLongPress)!
            .props.onLongPress(),
    );
    const old = confirmation('حذف');
    await restore();
    await invoke(old);
    expect(tracked()).toEqual(before);
    expect(alertError).toHaveBeenCalledWith(
      kind === 'voice' ? 'وویس حذف نشد' : 'عکس حذف نشد',
      expect.any(DatasetChangedError),
    );
  });

  it('refuses a held media source selection before native photo work', async () => {
    const restore = snapshot();
    const before = tracked();
    await render(<MediaTab patientId={patientId} />);
    await invoke(() => button('افزودن عکس بالینی').props.onPress());
    expect(mockSource).toBeDefined();
    const old = mockSource!;
    await restore();
    await invoke(() => old('library'));
    expect(mockPhotoWork).not.toHaveBeenCalled();
    expect(tracked()).toEqual(before);
    expect(alertError).toHaveBeenCalledWith('عکس ذخیره نشد', expect.any(DatasetChangedError));
  });

  it('refuses a lab panel removal opened after restore under the old Scope', async () => {
    await createLabPanel({ patientId, name: 'Synthetic panel', collectedAt: new Date(), source: 'manual', values: [] });
    const restore = snapshot();
    const before = tracked();
    await render(<LabsTab patientId={patientId} />);
    await restore();
    await invoke(() => tree!.root.findByType(Segmented).props.onChange('panels'));
    await invoke(() =>
      tree!.root
        .findAllByType(Pressable)
        .find((n) => n.props.onLongPress)!
        .props.onLongPress(),
    );
    await invoke(confirmation('حذف'));
    expect(tracked()).toEqual(before);
    expect(alertError).toHaveBeenCalledWith('حذف نشد', expect.any(DatasetChangedError));
  });

  it('allows fresh kardex, task, consult, star and delete actions without adding a workflow gate', async () => {
    await createOrder({ patientId, kind: 'drug', name: 'Synthetic order' });
    await render(<KardexTab patientId={patientId} />);
    await invoke(pressable('توقف موقت').props.onPress);
    expect(t.db.select().from(orders).all()[0]?.status).toBe('held');
    await act(async () => tree!.unmount());
    const taskId = await createTask({ patientId, title: 'Synthetic task' });
    await render(<TaskRow task={(await taskQuery(taskId))[0]!} patient={null} onOpen={() => {}} />);
    await invoke(pressable('انجام شد').props.onPress);
    await mockUndo!();
    expect((await taskQuery(taskId))[0]?.status).toBe('open');
    await act(async () => tree!.unmount());
    await createConsult({ patientId, reason: 'Synthetic request' });
    await render(<ConsultsSection patientId={patientId} />);
    await invoke(button('درخواست شد').props.onPress);
    expect(t.db.select().from(consultations).all()[0]?.status).toBe('requested');
    await invoke(button('لغو').props.onPress);
    await invoke(confirmation('لغو کانسالت'));
    expect(t.db.select().from(consultations).all()[0]?.status).toBe('cancelled');
    await act(async () => tree!.unmount());
    await render(<PatientHeader patient={(await patientQuery(patientId))[0]!} />);
    await invoke(tree!.root.findAllByType(IconButton).find((n) => n.props.label === 'ستاره‌دار کردن')!.props.onPress);
    expect((await patientQuery(patientId))[0]?.starred).toBe(true);
    await act(async () => tree!.unmount());
    const id = await createImagingStudy({ patientId, modality: 'other', status: 'ordered' });
    await render(<ImagingTab patientId={patientId} />);
    await invoke(() =>
      tree!.root
        .findAllByType(Pressable)
        .find((n) => n.props.onLongPress)!
        .props.onLongPress(),
    );
    await invoke(confirmation('حذف'));
    expect(
      t.db
        .select()
        .from(imagingStudies)
        .all()
        .find((n) => n.id === id)?.deletedAt,
    ).not.toBeNull();
    expect(alertError).not.toHaveBeenCalled();
  });
});
