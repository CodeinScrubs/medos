import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Linking } from 'react-native';

import { notify } from '@/components/feedback';
import type { Extension, Place } from '@/db/schema';
import { toPersianDigits } from '@/lib/persian';

import { dialDigits, extensionDialUri, mapsUri } from './logic';
import { recordExtensionUse } from './queries';

/**
 * Dial an extension from outside the hospital. Without a direct line or a
 * switchboard number there is nothing to dial, so the extension is copied
 * and the user is told what to add to make one-tap calling work.
 */
export async function callExtension(ext: Extension, place: Place): Promise<void> {
  const uri = extensionDialUri(ext, place);
  if (!uri) {
    await copyExtension(ext);
    notify(
      'شماره‌ی تلفنخانه ثبت نشده',
      `داخلی ${toPersianDigits(dialDigits(ext.extension))} کپی شد. برای تماس مستقیم از بیرون، شماره‌ی تلفنخانه‌ی ${place.name} را در مشخصات مرکز وارد کنید.`,
    );
    return;
  }
  void recordExtensionUse(ext.id);
  await Linking.openURL(uri).catch(() => notify('تماس برقرار نشد'));
}

export async function copyExtension(ext: Extension): Promise<void> {
  await Clipboard.setStringAsync(dialDigits(ext.extension));
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  void recordExtensionUse(ext.id);
}

export async function openInMaps(place: Place): Promise<void> {
  const uri = mapsUri(place);
  if (!uri) {
    notify('آدرس یا موقعیت ثبت نشده');
    return;
  }
  await Linking.openURL(uri).catch(() => notify('برنامه‌ی نقشه باز نشد', 'یک برنامه‌ی نقشه مثل نشان یا بلد نصب کنید.'));
}
