import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Linking } from 'react-native';

import { notify } from '@/components/feedback';
import type { Extension, Place } from '@/db/schema';
import { assertDatasetWrite, withDatasetWrite } from '@/lib/dataset-write';
import { normalizePhone, toPersianDigits } from '@/lib/persian';
import { logError } from '@/platform/error-log';

import { dialDigits, extensionDialUri, mapsUri } from './logic';
import { assertExtensionDeviceChoice, assertPlaceDeviceChoice, recordExtensionUse } from './queries';

/** The screen supplies its original generation, displayed basis and live ownership. */
export type PlaceDeviceOwner = { generation: number; expectedBasis: string; owns: () => boolean };

function requireOwner(owner: PlaceDeviceOwner): void {
  assertDatasetWrite(owner.generation);
  if (!owner.owns()) throw new Error('انتخاب قبلی در دسترس نیست؛ دوباره انتخاب کنید.');
}

function optionalFailure(kind: 'usage' | 'haptic'): void {
  // Do not copy platform/SQL exception text, phone numbers or private notes into logs.
  logError(
    new Error(kind === 'usage' ? 'Optional extension usage recording failed' : 'Optional extension haptic failed'),
    {
      source: 'handled',
      context: 'places optional device feedback',
    },
  );
}

async function acknowledgeExtension(ext: Extension, owner: PlaceDeviceOwner, copied: boolean): Promise<void> {
  if (!owner.owns()) return;
  try {
    await recordExtensionUse(ext.id, owner.expectedBasis);
  } catch {
    optionalFailure('usage');
  }
  if (copied && owner.owns()) {
    try {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => optionalFailure('haptic'));
    } catch {
      optionalFailure('haptic');
    }
  }
}

async function copyAcknowledged(ext: Extension): Promise<void> {
  const digits = dialDigits(ext.extension);
  if (!digits) throw new Error('شمارهٔ داخلی برای کپی معتبر نیست.');
  let saved: boolean;
  try {
    saved = await Clipboard.setStringAsync(digits);
  } catch {
    throw new Error('کپی داخلی انجام نشد؛ دوباره تلاش کنید.');
  }
  if (saved !== true) throw new Error('کپی داخلی تأیید نشد؛ دوباره تلاش کنید.');
}

/** The receipt proves a dialer/chooser launch, never that a call happened. */
export async function callExtension(ext: Extension, place: Place, owner: PlaceDeviceOwner): Promise<void> {
  await withDatasetWrite(owner.generation, async () => {
    requireOwner(owner);
    const choice = assertExtensionDeviceChoice(ext.id, owner.expectedBasis);
    if (choice.place.id !== place.id || choice.extension.placeId !== ext.placeId)
      throw new Error('مکان انتخاب‌شده تغییر کرده است.');
    const uri = extensionDialUri(choice.extension, choice.place);
    if (!uri) {
      await copyAcknowledged(choice.extension);
      if (owner.owns())
        notify(
          'شماره‌ی تلفنخانه ثبت نشده',
          `داخلی ${toPersianDigits(dialDigits(choice.extension.extension))} کپی شد؛ برای تماس مستقیم، شمارهٔ تلفنخانه را ثبت کنید.`,
        );
      await acknowledgeExtension(choice.extension, owner, true);
      return;
    }
    try {
      await Linking.openURL(uri);
    } catch {
      throw new Error('برنامهٔ تماس باز نشد؛ شماره را کپی کنید.');
    }
    await acknowledgeExtension(choice.extension, owner, false);
  });
}

export async function copyExtension(ext: Extension, owner: PlaceDeviceOwner): Promise<void> {
  await withDatasetWrite(owner.generation, async () => {
    requireOwner(owner);
    const choice = assertExtensionDeviceChoice(ext.id, owner.expectedBasis);
    await copyAcknowledged(choice.extension);
    await acknowledgeExtension(choice.extension, owner, true);
  });
}

export async function callPlace(place: Place, owner: PlaceDeviceOwner): Promise<void> {
  await withDatasetWrite(owner.generation, async () => {
    requireOwner(owner);
    const choice = assertPlaceDeviceChoice(place.id, owner.expectedBasis);
    const number = normalizePhone(choice.phone || choice.switchboard || '');
    if (!number) throw new Error('شمارهٔ تلفن ثبت نشده است.');
    try {
      await Linking.openURL(`tel:${number}`);
    } catch {
      throw new Error('برنامهٔ تماس باز نشد؛ شماره را کپی کنید.');
    }
  });
}

export async function openInMaps(place: Place, owner: PlaceDeviceOwner): Promise<void> {
  await withDatasetWrite(owner.generation, async () => {
    requireOwner(owner);
    const choice = assertPlaceDeviceChoice(place.id, owner.expectedBasis);
    const uri = mapsUri(choice);
    if (!uri) throw new Error('آدرس یا موقعیت ثبت نشده است.');
    try {
      await Linking.openURL(uri);
    } catch {
      throw new Error('برنامهٔ نقشه باز نشد؛ آدرس و برنامهٔ نقشه را بررسی کنید.');
    }
  });
}
