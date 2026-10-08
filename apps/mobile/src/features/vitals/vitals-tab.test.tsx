import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { Alert, Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, EmptyState, Input, SectionHeader } from '@/components/ui';
import { restoreDatabase } from '@/db/client';
import { tablesOf as mockTablesOf } from '@/db/query-tables';
import { vitalFormDrafts, vitals } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { openEncounter } from '@/features/encounters/queries';
import { DatasetBusyError, DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';
import { dateInputText } from '@/lib/date-input';
import { formatClock } from '@/lib/time';
import { replacementFailure } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { decodeVitalForm } from './form-draft';
import * as draftQueries from './form-draft-queries';
import { recordVital, updateVital, patientVitalsQuery, vitalQuery } from './queries';
import { VitalsTab } from './vitals-tab';
import { createPatient } from '../patients/queries';

let mockReadError: Error | undefined;
const mockRows = new Map<string, unknown[]>();
let mockFocused = true;
let mockFlush: (() => Promise<boolean>) | undefined;
const mockNavigation = { isFocused: () => mockFocused, setOptions: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }), useNavigation: () => mockNavigation }));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => mockNavigation }));
jest.mock('@/components/use-save-before-leave', () => ({
  useSaveBeforeLeave: (flush: () => Promise<boolean>) => {
    mockFlush = flush;
  },
}));
const mockRetry = jest.fn(() => {
  mockReadError = undefined;
});
// Expose the real form's press callbacks; this is not a native touch test.
jest.mock('react-native', () => {
  const native = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy(native, { get: (target, key) => (key === 'Pressable' ? 'Pressable' : Reflect.get(target, key)) });
});
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[] }) => {
    const key = mockTablesOf(query).sort().join(',');
    if (!mockReadError) mockRows.set(key, query.all());
    return { data: mockRows.get(key), error: mockReadError, retry: mockRetry };
  },
}));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  EmptyState: 'EmptyState',
  Input: 'Input',
  Row: 'Row',
  SectionHeader: 'SectionHeader',
  Text: 'Text',
}));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/quick-date-field', () => ({ QuickDateField: 'QuickDateField' }));
jest.mock('@/components/trend-chart', () => ({ TrendChart: 'TrendChart' }));
jest.mock('@/components/use-now', () => ({ useNow: () => new Date('2026-10-02T08:00:00Z').getTime() }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {} }) }));

let tree: ReactTestRenderer | undefined;
let patientId: string;
let t: TestDatabase;
let snapshotCounter = 0;
function snapshot() {
  const path = `/vitals-intent-${++snapshotCounter}.db`;
  t.sqlite.exec(`VACUUM INTO '${path}'`);
  return () => {
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
  };
}
const input = (label: string) => tree!.root.findAllByType(Input).find((node) => node.props.label === label)!;
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
async function settle() {
  for (let i = 0; i < 70; i++) await Promise.resolve();
}
const app = () => (
  <AutosaveScope>
    <VitalsTab patientId={patientId} />
  </AutosaveScope>
);
async function render() {
  await act(async () => {
    tree = create(app());
    await settle();
  });
}
async function startNew() {
  await act(async () => {
    (button('اندازه‌گیری تازه') ?? button('ادامهٔ اندازه‌گیری')).props.onPress();
    await settle();
  });
}
async function startEdit() {
  await act(async () => {
    tree!.root.findAllByType(Pressable)[0]!.props.onPress();
    await settle();
  });
}
async function type(label: string, value: string) {
  await act(async () => {
    input(label).props.onChangeText(value);
  });
}
async function save() {
  await act(async () => {
    button('ثبت').props.onPress();
    await settle();
  });
}

beforeEach(async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-02T08:00:00Z'));
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Vitals' });
  mockReadError = undefined;
  mockRows.clear();
  mockFocused = true;
  mockFlush = undefined;
  mockRetry.mockClear();
  jest.mocked(alertError).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  tree = undefined;
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('real observation form handlers', () => {
  it('cold remount recovers exact invalid raw input without creating a reading', async () => {
    await render();
    await startNew();
    await type('فشار (mmHg)', ' 120/x ');
    await type('نبض', '8,0');
    await type('توضیح', '  فارسی / English\nunfinished  ');
    await act(async () => {
      tree!.root
        .findByType(QuickDateField)
        .props.onRawInputChange({ dateText: '1400/12/30', clockText: '25:', customOpen: true });
      expect(await mockFlush!()).toBe(true);
    });
    const raw = t.db.select().from(vitalFormDrafts).get()!;
    expect(decodeVitalForm(raw.body).fields).toMatchObject({
      bp: ' 120/x ',
      heartRate: '8,0',
      notes: '  فارسی / English\nunfinished  ',
    });
    expect(await patientVitalsQuery(patientId)).toHaveLength(0);
    await act(async () => {
      tree!.unmount();
      await settle();
    });
    tree = undefined;
    await render();
    await startNew();
    expect(input('فشار (mmHg)').props.value).toBe(' 120/x ');
    expect(input('نبض').props.value).toBe('8,0');
    expect(tree!.root.findByType(QuickDateField).props.rawInput).toEqual({
      dateText: '1400/12/30',
      clockText: '25:',
      customOpen: true,
    });
    await save();
    expect(await patientVitalsQuery(patientId)).toHaveLength(0);
    expect(t.db.select().from(vitalFormDrafts).get()?.deletedAt).toBeNull();
  });

  it('closing acknowledges raw input and reopening resumes it without publishing', async () => {
    await render();
    await startNew();
    await type('نبض', '8');
    await act(async () => {
      button('بستن').props.onPress();
      await settle();
    });
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    expect(await patientVitalsQuery(patientId)).toHaveLength(0);
    expect(decodeVitalForm(t.db.select().from(vitalFormDrafts).get()!.body).fields.heartRate).toBe('8');
    await startNew();
    expect(input('نبض').props.value).toBe('8');
  });

  it('captures the original null admission before a later admission is opened', async () => {
    await render();
    await startNew();
    await type('نبض', '80');
    await openEncounter({ patientId, kind: 'admission', admittedAt: new Date('2026-10-02T07:00:00Z') });
    await save();
    expect((await patientVitalsQuery(patientId))[0]?.encounterId).toBeNull();
  });

  it('keeps the editor open when raw persistence fails and retries before publication', async () => {
    await render();
    await startNew();
    await type('نبض', '80');
    t.sqlite.exec(
      "CREATE TRIGGER fail_draft BEFORE INSERT ON vital_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic'); END",
    );
    await act(async () => {
      button('بستن').props.onPress();
      await settle();
    });
    expect(input('نبض').props.value).toBe('80');
    expect(await patientVitalsQuery(patientId)).toHaveLength(0);
    t.sqlite.exec('DROP TRIGGER fail_draft');
    await act(async () => {
      button('تلاش دوباره').props.onPress();
      await settle();
    });
    expect(decodeVitalForm(t.db.select().from(vitalFormDrafts).get()!.body).fields.heartRate).toBe('80');
    await save();
    expect(await patientVitalsQuery(patientId)).toHaveLength(1);
  });

  it('does not replace an editor while its raw save is refused during a reading switch', async () => {
    const id = await recordVital({ patientId, heartRate: 70 });
    await render();
    await startNew();
    await type('نبض', '80');
    t.sqlite.exec(
      "CREATE TRIGGER fail_draft BEFORE INSERT ON vital_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic'); END",
    );
    await startEdit();
    expect(input('نبض').props.value).toBe('80');
    expect((await vitalQuery(id))[0]?.heartRate).toBe(70);
    t.sqlite.exec('DROP TRIGGER fail_draft');
    await startEdit();
    expect(input('نبض').props.value).toBe('70');
    const raw = t.db.select().from(vitalFormDrafts).get()!;
    expect(raw.vitalId).toBeNull();
    expect(decodeVitalForm(raw.body).fields.heartRate).toBe('80');
  });

  it('holds dataset admission through delayed clinical acknowledgment and retains an unfocused completed form', async () => {
    const commit = draftQueries.commitVitalFormDraft;
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.spyOn(draftQueries, 'commitVitalFormDraft').mockImplementation(async (...args) => {
      const id = await commit(...args);
      await wait;
      return id;
    });
    await render();
    await startNew();
    await type('نبض', '80');
    await save();
    expect(await patientVitalsQuery(patientId)).toHaveLength(1);
    expect(replacementFailure()).toBeInstanceOf(DatasetBusyError);
    mockFocused = false;
    await act(async () => {
      release();
      await settle();
    });
    expect(input('نبض').props.value).toBe('80');
    expect(input('نبض').props.editable).toBe(false);
    mockFocused = true;
    await act(async () => {
      button('بستن').props.onPress();
      await settle();
    });
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    expect(await patientVitalsQuery(patientId)).toHaveLength(1);
  });

  it('keeps raw input after a rollback and publishes once after the fault is removed', async () => {
    await render();
    await startNew();
    await type('نبض', '80');
    t.sqlite.exec(
      "CREATE TRIGGER fail_retire BEFORE UPDATE ON vital_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic'); END",
    );
    await save();
    expect(await patientVitalsQuery(patientId)).toHaveLength(0);
    expect(input('نبض').props.value).toBe('80');
    expect(t.db.select().from(vitalFormDrafts).get()?.deletedAt).toBeNull();
    t.sqlite.exec('DROP TRIGGER fail_retire');
    await save();
    expect(await patientVitalsQuery(patientId)).toHaveLength(1);
  });

  it('refuses a delayed draft discard after actual replacement without losing visible input', async () => {
    await render();
    await startNew();
    await type('نبض', '80');
    await act(async () => {
      expect(await mockFlush!()).toBe(true);
    });
    const restore = snapshot();
    await act(async () => button('حذف پیش‌نویس').props.onPress());
    const discard = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((choice) => choice.text === 'حذف پیش‌نویس')!;
    await act(async () => {
      restore();
      discard.onPress!();
      await settle();
    });
    expect(input('نبض').props.value).toBe('80');
    expect(t.db.select().from(vitalFormDrafts).get()?.deletedAt).toBeNull();
    expect(alertError).toHaveBeenCalledWith('ثبت نشد', expect.any(DatasetChangedError));
  });

  it('continues autosaving after explicit Keep mine while retaining an independent correction', async () => {
    const id = await recordVital({ patientId, heartRate: 70, temperature: 37 });
    await render();
    await startEdit();
    await type('نبض', '80');
    await updateVital(id, { heartRate: 75, temperature: 38 });
    await save();
    await act(async () => {
      button('بررسی پیش‌نویس ذخیره‌شده').props.onPress();
      await settle();
    });
    await act(async () => button('نگه‌داشتن نسخهٔ من').props.onPress());
    const keep = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((choice) => choice.text === 'نگه‌داشتن نسخهٔ من')!;
    await act(async () => {
      keep.onPress!();
      await settle();
    });
    await type('توضیح', '  Edited after Keep mine  ');
    await act(async () => {
      expect(await mockFlush!()).toBe(true);
    });
    expect(decodeVitalForm(t.db.select().from(vitalFormDrafts).get()!.body).fields.notes).toBe(
      '  Edited after Keep mine  ',
    );
    await save();
    expect((await vitalQuery(id))[0]).toMatchObject({
      heartRate: 80,
      temperature: 38,
      notes: 'Edited after Keep mine',
    });
  });

  it('retains raw input and refuses an old new measurement after real dataset replacement', async () => {
    const restore = snapshot();
    await render();
    await startNew();
    await type('نبض', '81');
    const oldSave = button('ثبت').props.onPress;
    await act(async () => restore());
    await act(async () => {
      oldSave();
      await settle();
    });
    expect(await patientVitalsQuery(patientId)).toHaveLength(0);
    expect(input('نبض').props.value).toBe('81');
    expect(alertError).toHaveBeenCalledWith('ثبت نشد', expect.any(DatasetChangedError));
  });

  it('cannot overwrite a restored same-ID reading even when the original comparison still matches', async () => {
    const id = await recordVital({ patientId, heartRate: 80 });
    const restore = snapshot();
    await render();
    await startEdit();
    await type('نبض', '90');
    const oldSave = button('ثبت').props.onPress;
    await act(async () => restore());
    await act(async () => {
      oldSave();
      await settle();
    });
    expect((await vitalQuery(id))[0]?.heartRate).toBe(80);
    expect(input('نبض').props.value).toBe('90');
    expect(alertError).toHaveBeenCalledWith('ثبت نشد', expect.any(DatasetChangedError));
  });

  it('rejects an old delete confirmation after real same-ID replacement and remount', async () => {
    const id = await recordVital({ patientId, heartRate: 80 });
    const restore = snapshot();
    await render();
    await act(async () => tree!.root.findAllByType(Pressable)[0]!.props.onLongPress());
    const remove = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((choice) => choice.text === 'حذف')!;
    await act(async () => {
      restore();
      tree!.unmount();
    });
    await render();
    await act(async () => {
      remove.onPress!();
      await settle();
    });
    expect((await vitalQuery(id))[0]?.deletedAt).toBeNull();
    expect(alertError).toHaveBeenCalledWith('حذف نشد', expect.any(DatasetChangedError));
    await startEdit();
    await type('نبض', '85');
    await save();
    expect((await vitalQuery(id))[0]?.heartRate).toBe(85);
  });

  it('publishes once when the same Save handler is pressed twice before rendering', async () => {
    await render();
    await startNew();
    await type('نبض', '80');
    const submit = button('ثبت').props.onPress;
    await act(async () => {
      submit();
      submit();
      await settle();
    });
    expect(await patientVitalsQuery(patientId)).toHaveLength(1);
  });

  it('reads the latest input when typing and Save happen in the same event turn', async () => {
    await render();
    await startNew();
    const submit = button('ثبت').props.onPress;
    await act(async () => {
      input('نبض').props.onChangeText('81');
      submit();
      await settle();
    });
    expect((await patientVitalsQuery(patientId))[0]?.heartRate).toBe(81);
  });

  it('preserves a newer unrelated reading and untouched exact notes when correcting pulse', async () => {
    const id = await recordVital({ patientId, heartRate: 80, temperature: 37 });
    t.db.update(vitals).set({ notes: '  Synthetic exact note  ' }).where(eq(vitals.id, id)).run();
    await render();
    await startEdit();
    await updateVital(id, { temperature: 38 });
    await type('نبض', '90');
    await save();
    expect((await vitalQuery(id))[0]).toMatchObject({
      heartRate: 90,
      temperature: 38,
      notes: '  Synthetic exact note  ',
    });
  });

  it('refuses a changed pulse conflict and keeps the entered value available', async () => {
    const id = await recordVital({ patientId, heartRate: 80, temperature: 37 });
    await render();
    await startEdit();
    await updateVital(id, { heartRate: 82 });
    await type('نبض', '90');
    await save();
    expect((await vitalQuery(id))[0]?.heartRate).toBe(82);
    expect(input('نبض').props.value).toBe('90');
    expect(alertError).toHaveBeenCalledTimes(1);
  });

  it('does not publish an old parsed time while the visible time is invalid', async () => {
    await render();
    await startNew();
    await type('نبض', '80');
    await act(async () => {
      tree!.root.findByType(QuickDateField).props.onValidityChange(false);
    });
    await save();
    expect(await patientVitalsQuery(patientId)).toHaveLength(0);
    expect(input('نبض').props.value).toBe('80');
  });

  it('uses the last valid measured time when time selection and Save happen in one event turn', async () => {
    await render();
    await startNew();
    await type('نبض', '80');
    const measuredAt = new Date('2026-10-01T08:15:00Z');
    const submit = button('ثبت').props.onPress;
    await act(async () => {
      tree!.root.findByType(QuickDateField).props.onRawInputChange({
        dateText: dateInputText(measuredAt),
        clockText: formatClock(measuredAt),
        customOpen: true,
      });
      submit();
      await settle();
    });
    expect((await patientVitalsQuery(patientId))[0]?.measuredAt).toEqual(measuredAt);
  });

  it('refuses to combine a locally changed BP with a concurrently corrected counterpart', async () => {
    const id = await recordVital({ patientId, systolic: 120, diastolic: 80 });
    await render();
    await startEdit();
    await updateVital(id, { diastolic: 110 });
    await type('فشار (mmHg)', '100/80');
    await save();
    expect((await vitalQuery(id))[0]).toMatchObject({ systolic: 120, diastolic: 110 });
    expect(input('فشار (mmHg)').props.value).toBe('100/80');
    expect(alertError).toHaveBeenCalledTimes(1);
  });

  it('retains edited input across a failed refresh and retry while withholding the stale count', async () => {
    await recordVital({ patientId, heartRate: 80 });
    await render();
    await startEdit();
    await type('نبض', '90');
    mockReadError = new Error('Synthetic refresh failure');
    await act(async () => {
      tree!.update(app());
    });
    expect(input('نبض').props.value).toBe('90');
    expect(
      tree!.root.findAllByType(SectionHeader).find((node) => node.props.title === 'اندازه‌گیری‌ها')?.props.count,
    ).toBeUndefined();
    await act(async () => {
      tree!.root
        .findAllByType(ErrorNotice)
        .find((node) => node.props.what === 'علائم حیاتی')!
        .props.onRetry();
      tree!.update(app());
    });
    expect(input('نبض').props.value).toBe('90');
    expect(
      tree!.root.findAllByType(SectionHeader).find((node) => node.props.title === 'اندازه‌گیری‌ها')?.props.count,
    ).toBe(1);
  });

  it('shows retry without claiming an empty successful result on failed initial reads', async () => {
    mockReadError = new Error('Synthetic read failure');
    await render();
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(0);
    const notice = tree!.root.findAllByType(ErrorNotice).find((node) => node.props.what === 'علائم حیاتی')!;
    expect(notice.props.onRetry).toBe(mockRetry);
    await act(async () => {
      notice.props.onRetry();
      tree!.update(app());
    });
    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(1);
  });
});
