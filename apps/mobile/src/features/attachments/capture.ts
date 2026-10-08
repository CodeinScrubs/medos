import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { notify } from '@/components/feedback';
import type { AttachmentEntity, AttachmentKind } from '@/db/schema';
import { readSetting } from '@/db/settings';
import { withFileJob } from '@/lib/file-work';
import { storePhoto } from '@/platform/media';

import { addAttachment, checkAttachmentTarget } from './queries';
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
    // Full quality in; storePhoto() does the one controlled compression pass.
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
export async function storeAndAttach(assets: ImagePicker.ImagePickerAsset[], target: AttachTarget): Promise<string[]> {
  // Capture caller-owned values before yielding, and protect direct callers too.
  const captured = { ...target };
  const sources = assets.map(({ uri, width, height, mimeType }) => ({ uri, width, height, mimeType }));
  return withFileJob(async () => {
    checkAttachmentTarget(captured);
    const ids: string[] = [];
    const keepOriginal = shouldKeepOriginal(await readSetting(keepOriginalsMode), captured.kind);
    for (const source of sources) {
      checkAttachmentTarget(captured);
      const stored = await storePhoto(source, { keepOriginal });
      ids.push(
        await addAttachment({
          entityType: captured.entityType,
          entityId: captured.entityId,
          patientId: captured.patientId,
          kind: captured.kind,
          relativePath: stored.relativePath,
          thumbnailPath: stored.thumbnailPath,
          originalPath: stored.originalPath,
          originalMimeType: stored.originalMimeType,
          checksum: stored.checksum,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          width: stored.width,
          height: stored.height,
          caption: captured.caption ?? null,
          bodySite: captured.bodySite ?? null,
        }),
      );
    }
    return ids;
  });
}

/** Pick or shoot photos and attach them to an existing entity in one step. */
export async function attachPhotos({
  source,
  crop = false,
  multiple = false,
  ...target
}: AttachTarget & { source: PhotoSource; crop?: boolean; multiple?: boolean }): Promise<string[]> {
  return withFileJob(async () => {
    checkAttachmentTarget(target);
    const assets = await pickPhotos(source, { crop, multiple });
    if (!assets) return [];
    // Nested file jobs are supported; this outer lease also owns the picker.
    return storeAndAttach(assets, target);
  });
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
