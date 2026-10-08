import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ImagePickerOptions, ImagePickerResult } from 'expo-image-picker';
import { Dimensions, StyleSheet, Text as RNText } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { Button, Text } from '@/components/ui';
import { restoreDatabase } from '@/db/client';
import { attachments, labPanels } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';
import { fileJobsActive, FileWorkBusyError, reserveFileMaintenance } from '@/lib/file-work';
import type { storePhoto } from '@/platform/media';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { LabsTab } from './labs-tab';
import { createLabPanel } from './queries';
import { TrendScreen } from './trend-screen';

let mockChoose: ((source: 'camera' | 'library') => void) | undefined;
let mockTrendParams: { id: string; analyte: string };
const mockPicker = jest.fn<(options: ImagePickerOptions) => Promise<ImagePickerResult>>();
const mockStore = jest.fn<typeof storePhoto>();
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/db/use-live', () => ({ useLive: (query: { all(): unknown[] }) => ({ data: query.all() }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => mockTrendParams,
}));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('@/components/trend-chart', () => ({ TrendChart: 'TrendChart' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (options: ImagePickerOptions) => mockPicker(options),
}));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/ui', () => ({
  Badge: 'Badge',
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  EmptyState: 'EmptyState',
  Row: 'Row',
  Segmented: 'Segmented',
  Text: jest.requireActual<typeof import('@/components/ui/text')>('@/components/ui/text').Text,
  Screen: 'Screen',
  Divider: 'Divider',
}));
jest.mock('@/platform/media', () => ({
  mediaUri: (value: string) => value,
  storePhoto: (...args: Parameters<typeof storePhoto>) => mockStore(...args),
}));
jest.mock('@/features/attachments/capture', () => ({
  ...jest.requireActual<object>('@/features/attachments/capture'),
  askPhotoSource: (choose: typeof mockChoose) => {
    mockChoose = choose;
  },
}));

let t: TestDatabase;
let patientId: string;
let tree: ReactTestRenderer | undefined;
let snapshotCounter = 0;
function snapshot() {
  const path = `/lab-intent-${++snapshotCounter}.db`;
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
const picked = (): ImagePickerResult => ({
  canceled: false,
  assets: [{ uri: 'file:///synthetic-lab.jpg', width: 640, height: 480 }],
});
async function choose(): Promise<void> {
  await act(async () => {
    await mockChoose!('library');
  });
}

beforeEach(async () => {
  expect(fileJobsActive()).toBe(false);
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Lab' });
  mockTrendParams = { id: patientId, analyte: 'Synthetic custom' };
  mockChoose = undefined;
  jest.mocked(alertError).mockClear();
  mockPicker.mockReset().mockResolvedValue(picked());
  mockStore.mockReset().mockResolvedValue({
    relativePath: 'media/synthetic/lab.jpg',
    thumbnailPath: 'media/synthetic/thumb.jpg',
    originalPath: 'media/synthetic/original.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 100,
    width: 640,
    height: 480,
  });
  await act(async () => {
    tree = create(<LabsTab patientId={patientId} />);
  });
  act(() => {
    tree!.root
      .findAllByType(Button)
      .find((node) => node.props.label === 'عکس برگه')!
      .props.onPress();
  });
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = undefined;
});

describe('lab photo callback', () => {
  it.each([1, 1.6])('fits actual numeric value and unit inside one aligned row at font scale %s', async (fontScale) => {
    const original = Dimensions.get('window');
    const dimension = jest.spyOn(Dimensions, 'get').mockReturnValue({ ...original, fontScale });
    try {
      await createLabPanel({
        patientId,
        collectedAt: new Date(1_700_000_000_000),
        source: 'manual',
        values: [{ analyte: 'Synthetic custom', value: '12.4', unit: 'mg/dL' }],
      });
      await act(async () => {
        tree!.update(<LabsTab patientId={patientId} />);
      });
      const unit = tree!.root.findAllByType(Text).find((n) => n.props.children === 'mg/dL')!;
      const cell = unit.parent!;
      const value = cell.findAllByType(Text).find((n) => n !== unit)!;
      const unitStyle = StyleSheet.flatten(unit.findByType(RNText).props.style);
      const valueStyle = StyleSheet.flatten(value.findByType(RNText).props.style);
      const cellStyle = StyleSheet.flatten(cell.props.style);
      expect(cellStyle.height).toBeGreaterThanOrEqual((unitStyle.lineHeight + valueStyle.lineHeight) * fontScale + 6);
      expect(unitStyle.fontSize).toBeLessThan(valueStyle.fontSize);
    } finally {
      dimension.mockRestore();
    }
  });
  it('labels every recorded value with its own unit in the flowsheet and trend history', async () => {
    for (const [index, unit] of ['mg/dL', 'µmol/L', null].entries()) {
      await createLabPanel({
        patientId,
        collectedAt: new Date(1_700_000_000_000 + index * 86400000),
        source: 'manual',
        values: [{ analyte: mockTrendParams.analyte, value: String(20 + index), unit }],
      });
    }
    const visibleUnits = () => tree!.root.findAllByType(Text).map((n) => n.props.children);
    await act(async () => {
      tree!.update(<LabsTab patientId={patientId} />);
    });
    expect(visibleUnits()).toEqual(expect.arrayContaining(['mg/dL', 'µmol/L', 'بدون واحد']));
    await act(async () => {
      tree!.unmount();
    });
    await act(async () => {
      tree = create(<TrendScreen />);
    });
    expect(visibleUnits()).toEqual(expect.arrayContaining(['mg/dL', 'µmol/L', 'بدون واحد']));
  });

  it('refuses a source selection held across same-ID replacement before opening the picker', async () => {
    const restore = snapshot();
    await act(async () => restore());
    await choose();
    expect(alertError).toHaveBeenCalledWith('ذخیره نشد', expect.any(DatasetChangedError));
    expect(mockPicker).not.toHaveBeenCalled();
    expect(mockStore).not.toHaveBeenCalled();
    expect(t.db.select().from(labPanels).all()).toHaveLength(0);
    expect(t.db.select().from(attachments).all()).toHaveLength(0);
    expect(fileJobsActive()).toBe(false);
  });
  it('contains picker rejection in visible feedback and releases the job', async () => {
    const error = new Error('Synthetic picker rejected');
    mockPicker.mockRejectedValue(error);
    await expect(choose()).resolves.toBeUndefined();
    expect(alertError).toHaveBeenCalledWith('ذخیره نشد', error);
    expect(t.db.select().from(labPanels).all()).toHaveLength(0);
    expect(fileJobsActive()).toBe(false);
  });

  it('refuses maintenance before picking or creating a lab panel', async () => {
    const release = reserveFileMaintenance();
    try {
      await choose();
    } finally {
      release();
    }
    expect(alertError).toHaveBeenCalledWith('ذخیره نشد', expect.any(FileWorkBusyError));
    expect(mockPicker).not.toHaveBeenCalled();
    expect(t.db.select().from(labPanels).all()).toHaveLength(0);
    expect(t.db.select().from(attachments).all()).toHaveLength(0);
  });

  it('refuses a deleted patient before opening the picker', async () => {
    await deletePatient(patientId);
    await choose();
    expect(alertError).toHaveBeenCalled();
    expect(mockPicker).not.toHaveBeenCalled();
    expect(t.db.select().from(labPanels).all()).toHaveLength(0);
  });

  it('excludes restore across picker, panel creation and photo acknowledgement; ignores a duplicate callback', async () => {
    const completions: ((result: ImagePickerResult) => void)[] = [];
    mockPicker.mockImplementation(
      () =>
        new Promise((resolve) => {
          completions.push(resolve);
        }),
    );
    let first!: Promise<void>;
    let second: Promise<void> | undefined;
    await act(async () => {
      first = Promise.resolve(mockChoose!('library'));
      try {
        expect(() => reserveFileMaintenance()()).toThrow(FileWorkBusyError);
        second = Promise.resolve(mockChoose!('library'));
        expect(mockPicker).toHaveBeenCalledTimes(1);
        expect(t.db.select().from(labPanels).all()).toHaveLength(0);
      } finally {
        completions.forEach((finish) => finish(picked()));
        await Promise.all([first, second]);
      }
    });
    const panels = t.db.select().from(labPanels).all();
    const photos = t.db.select().from(attachments).all();
    expect(panels).toHaveLength(1);
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({ entityType: 'lab_panel', entityId: panels[0]!.id, patientId, kind: 'lab_sheet' });
    expect(fileJobsActive()).toBe(false);
    reserveFileMaintenance()();
  });

  it('cancel leaves no empty panel and releases maintenance exclusion', async () => {
    mockPicker.mockResolvedValue({ canceled: true, assets: null });
    await choose();
    expect(t.db.select().from(labPanels).all()).toHaveLength(0);
    expect(mockStore).not.toHaveBeenCalled();
    expect(alertError).not.toHaveBeenCalled();
    expect(fileJobsActive()).toBe(false);
  });
});
