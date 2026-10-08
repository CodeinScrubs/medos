import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { notify } from '@/components/feedback';
import type { AttachmentEntity, AttachmentKind } from '@/db/schema';
import { readSetting } from '@/db/settings';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { withFileJob } from '@/lib/file-work';

import { persistPhotoImport } from './photo-import-queries';
import { checkAttachmentTarget } from './queries';
import { keepOriginalsMode, shouldKeepOriginal } from './settings';

export type PhotoSource = 'camera' | 'library';

/**
 * Open the camera or the system photo picker.
 *
 * Import before editing. Android's native cropper replaces the picker URI,
 * which would make an already-cropped result masquerade as the original.
 * Older callers may still request `crop`; it is deliberately ignored here.
 */
export async function pickPhotos(
  source: PhotoSource,
  { multiple = false }: { crop?: boolean; multiple?: boolean } = {},
): Promise<ImagePicker.ImagePickerAsset[] | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      notify('دسترسی دوربین لازم است', 'از تنظیمات گوشی، دسترسی دوربین را برای MedOS فعال کنید.');
      return null;
    }
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    // Full quality in; the durable import journal generates the working derivative.
    quality: 1,
    exif: false,
    allowsEditing: false,
    allowsMultipleSelection: multiple,
    selectionLimit: multiple ? 20 : 1,
  };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled || !result.assets?.length) return null;
  return result.assets;
}

export type AttachTarget = {
  entityType: AttachmentEntity;
  entityId: string;
  patientId?: string | null;
  kind: AttachmentKind;
  caption?: string | null;
  bodySite?: string | null;
};

/** Compress, store and attach already-picked assets. Returns the new attachment ids. */
export async function storeAndAttach(
  assets: ImagePicker.ImagePickerAsset[],
  target: AttachTarget,
  now = new Date(),
): Promise<string[]> {
  // Capture caller-owned values before yielding, and protect direct callers too.
  const captured = { ...target };
  const sources = assets.map(({ uri, width, height, mimeType }) => ({ uri, width, height, mimeType }));
  const generation = datasetGeneration();
  return withDatasetWrite(generation, () =>
    withFileJob(async () => {
      checkAttachmentTarget(captured);
      const keepOriginal = shouldKeepOriginal(await readSetting(keepOriginalsMode), captured.kind);
      if (!sources.length) return [];
      return persistPhotoImport(sources, captured, keepOriginal, now, generation);
    }),
  );
}

/** Pick or shoot photos and attach them to an existing entity in one step. */
export async function attachPhotos({
  source,
  crop = false,
  multiple = false,
  now = new Date(),
  ...target
}: AttachTarget & { source: PhotoSource; crop?: boolean; multiple?: boolean; now?: Date }): Promise<string[]> {
  const generation = datasetGeneration();
  return withDatasetWrite(generation, () =>
    withFileJob(async () => {
      checkAttachmentTarget(target);
      const assets = await pickPhotos(source, { crop, multiple });
      if (!assets) return [];
      // Nested file jobs are supported; this outer lease also owns the picker.
      return storeAndAttach(assets, target, now);
    }),
  );
}

/** No empty clinical panel is created until every selected photo is verified. */
export async function attachLabPhotoPanel(
  source: PhotoSource,
  patientId: string,
  generation: number,
  now = new Date(),
): Promise<string[]> {
  return withDatasetWrite(generation, () =>
    withFileJob(async () => {
      const target: AttachTarget = { entityType: 'patient', entityId: patientId, patientId, kind: 'lab_sheet' };
      checkAttachmentTarget(target);
      const encounterId = resolveActiveEncounterId(patientId);
      const assets = await pickPhotos(source, { multiple: source === 'library' });
      if (!assets) return [];
      const keepOriginal = shouldKeepOriginal(await readSetting(keepOriginalsMode), 'lab_sheet');
      const sources = assets.map(({ uri, width, height, mimeType }) => ({ uri, width, height, mimeType }));
      return persistPhotoImport(sources, target, keepOriginal, now, generation, true, encounterId);
    }),
  );
}

/** "Camera or gallery?" — the question every photo button starts with. */
export function askPhotoSource(onPick: (source: PhotoSource) => void): void {
  Alert.alert(
    'افزودن عکس',
    undefined,
    [
      { text: 'دوربین', onPress: () => onPick('camera') },
      { text: 'گالری', onPress: () => onPick('library') },
      { text: 'انصراف', style: 'cancel' },
    ],
    { cancelable: true },
  );
}
