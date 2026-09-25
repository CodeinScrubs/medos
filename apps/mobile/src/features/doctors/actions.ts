import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Alert, Linking } from 'react-native';

import { normalizePhone } from '@/lib/persian';

/*
 * Reaching a colleague. Every one of these hands the message to an app the
 * user already has; MedOS never sends anything by itself.
 */

/** True when the other app actually opened — the greeting log depends on it. */
async function open(url: string, failure: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert('باز نشد', failure);
    return false;
  }
}

export async function callNumber(phone: string | null | undefined): Promise<boolean> {
  const number = normalizePhone(phone ?? '');
  if (!number) return false;
  return open(`tel:${number}`, 'شماره را کپی کنید و دستی بگیرید.');
}

export async function copyText(text: string | null | undefined): Promise<void> {
  if (!text) return;
  await Clipboard.setStringAsync(text);
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/**
 * Open a messenger with the text already written, ready to send.
 *
 * WhatsApp and Telegram both take the number in international form, so a
 * local `09…` is rewritten to `98…`. If the app is not installed the URL
 * simply fails to open and the user is told; the text is still on the
 * clipboard from the copy button next to it.
 */
function internationalNumber(phone: string): string {
  const digits = normalizePhone(phone).replace(/\D/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `98${digits.slice(1)}`;
  return digits;
}

export async function sendSms(phone: string | null | undefined, body: string): Promise<boolean> {
  const number = normalizePhone(phone ?? '');
  if (!number) return false;
  return open(`sms:${number}?body=${encodeURIComponent(body)}`, 'پیام‌رسان باز نشد. متن کپی شده است.');
}

export async function sendWhatsApp(phone: string | null | undefined, body: string): Promise<boolean> {
  const number = phone ? internationalNumber(phone) : '';
  if (!number) return false;
  return open(`https://wa.me/${number}?text=${encodeURIComponent(body)}`, 'واتس‌اپ باز نشد. متن کپی شده است.');
}

export async function sendTelegram(handle: string | null | undefined, body: string): Promise<boolean> {
  const user = (handle ?? '').trim().replace(/^@/, '');
  if (!user) return false;
  // Telegram's share link opens a chat with the text prefilled.
  return open(
    `https://t.me/${encodeURIComponent(user)}?text=${encodeURIComponent(body)}`,
    'تلگرام باز نشد. متن کپی شده است.',
  );
}
